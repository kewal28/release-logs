const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authRateLimit } = require('../middleware/rateLimit');
const { authenticateToken, authenticateUser } = require('../middleware/auth');
const emailService = require('../services/emailService');
const settingsService = require('../services/settings');

const router = express.Router();

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function uniqueUsernameFromEmail(email) {
  const local = email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40)
    .replace(/^_+|_+$/g, '') || 'user';
  let candidate = local.slice(0, 50);
  let n = 0;
  while (true) {
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ?', [candidate]);
    if (rows.length === 0) return candidate;
    n += 1;
    candidate = `${local}`.slice(0, 44) + n;
  }
}

async function sendVerificationEmail(email, rawToken) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const link = `${baseUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const config = await settingsService.getAppConfig();
  const company = config.company.name || 'Release Log';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="font-weight:600;">Verify your email</h2>
      <p>Thanks for signing up for ${company}. Confirm your address to access the dashboard.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">Verify email</a></p>
      <p style="color:#6b7280;font-size:14px;">If the button does not work, paste this link into your browser:<br/><span style="word-break:break-all;">${link}</span></p>
    </div>`;
  const ok = await emailService.sendEmail(email, `Verify your email — ${company}`, html);
  if (!ok) {
    console.warn('Verification email not sent (check SMTP env). Link:', link);
  }
  return ok;
}

router.post(
  '/login',
  authRateLimit,
  [
    body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body('username').optional({ checkFalsy: true }).trim(),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
    body().custom((_, { req }) => {
      const e = (req.body.email || '').trim();
      const u = (req.body.username || '').trim();
      if (!e && !u) throw new Error('Email or username is required');
      return true;
    })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, username, password } = req.body;

      let users;
      if (email) {
        [users] = await pool.execute(
          'SELECT id, username, email, password_hash, is_admin, email_verified, display_name FROM users WHERE email = ?',
          [email]
        );
      } else {
        [users] = await pool.execute(
          'SELECT id, username, email, password_hash, is_admin, email_verified, display_name FROM users WHERE username = ?',
          [username]
        );
      }

      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          is_admin: user.is_admin,
          email_verified: !!user.email_verified
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          display_name: user.display_name,
          is_admin: !!user.is_admin,
          email_verified: !!user.email_verified
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/signup',
  authRateLimit,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const name = req.body.name.trim();
      const email = req.body.email;
      const password = req.body.password;

      const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      await emailService.initialize();
      if (process.env.NODE_ENV === 'production' && !emailService.isConfigured) {
        return res.status(503).json({
          error: 'Sign up is unavailable until SMTP is configured (set SMTP_* environment variables).'
        });
      }

      const username = await uniqueUsernameFromEmail(email);
      const passwordHash = await bcrypt.hash(password, 10);
      const rawToken = uuidv4() + uuidv4();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);

      await pool.execute(
        `INSERT INTO users (username, email, display_name, password_hash, is_admin, email_verified, verification_token_hash, verification_token_expires_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        [username, email, name, passwordHash, tokenHash, expiresAt]
      );

      await sendVerificationEmail(email, rawToken);

      res.status(201).json({
        message: 'Account created. Check your email to verify your address.',
        email
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/verify-email', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid verification link' });
    }
    const tokenHash = hashToken(token);
    const [result] = await pool.execute(
      `UPDATE users SET email_verified = 1, verification_token_hash = NULL, verification_token_expires_at = NULL
       WHERE verification_token_hash = ? AND verification_token_expires_at > NOW()`,
      [tokenHash]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }
    res.json({ message: 'Email verified. You can sign in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/resend-verification', authRateLimit, authenticateUser, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, email, email_verified FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!users.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const u = users[0];
    if (u.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    const rawToken = uuidv4() + uuidv4();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    await pool.execute(
      'UPDATE users SET verification_token_hash = ?, verification_token_expires_at = ? WHERE id = ?',
      [tokenHash, expiresAt, u.id]
    );
    await emailService.initialize();
    await sendVerificationEmail(u.email, rawToken);
    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/register',
  authenticateToken,
  authRateLimit,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body;

      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [result] = await pool.execute(
        'INSERT INTO users (username, email, display_name, password_hash, is_admin, email_verified) VALUES (?, ?, ?, ?, 1, 1)',
        [username, email, username, passwordHash]
      );

      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: result.insertId,
          username,
          email,
          is_admin: true,
          email_verified: true
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/me', authenticateUser, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, display_name, is_admin, email_verified, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    res.json({
      user: {
        ...user,
        is_admin: !!user.is_admin,
        email_verified: !!user.email_verified
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/change-password',
  authenticateUser,
  [
    body('currentPassword').isLength({ min: 1 }).withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const [users] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);

      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isValidCurrentPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
      if (!isValidCurrentPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
