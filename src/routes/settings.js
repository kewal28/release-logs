const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { authenticateUser, requireAdmin, requireVerifiedEmail } = require('../middleware/auth');
const settingsService = require('../services/settings');
const emailService = require('../services/emailService');
const fileStorage = require('../services/fileStorage');

const router = express.Router();

// Configure multer for logo upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
});

// Apply authentication to all settings routes
router.use(authenticateUser);
router.use(requireVerifiedEmail);

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all application settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Application settings
 *       401:
 *         description: Unauthorized
 */
router.get('/', async (req, res) => {
  try {
    const themes = settingsService.getAvailableThemes();
    const timezones = settingsService.getAvailableTimezones();
    await emailService.initialize();

    res.json({
      config: await settingsService.getAppConfig({ maskSecrets: true }),
      themes,
      timezones,
      emailStatus: emailService.getStatus()
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * @swagger
 * /api/settings/company:
 *   put:
 *     summary: Update company settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_name:
 *                 type: string
 *                 description: Company name (optional if logo_url is provided)
 *               logo_url:
 *                 type: string
 *                 description: Logo URL (optional if company_name is provided)
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/company', [
  body('company_name').optional().trim().isLength({ max: 255 }).withMessage('Company name must be less than 255 characters'),
  body('logo_url').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    // Only validate URL if a value is provided
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(value)) {
      throw new Error('Logo URL must be a valid URL');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { company_name, logo_url } = req.body;

    // Validate that either company_name or logo_url is provided
    if ((!company_name || company_name.trim() === '') && (!logo_url || logo_url.trim() === '')) {
      return res.status(400).json({ 
        error: 'Either company name or logo URL must be provided' 
      });
    }

    await Promise.all([
      settingsService.setSetting('company_name', company_name || '', 'string', 'Company/Application Name'),
      settingsService.setSetting('logo_url', logo_url || '', 'string', 'Logo URL')
    ]);

    res.json({ message: 'Company settings updated successfully' });
  } catch (error) {
    console.error('Error updating company settings:', error);
    res.status(500).json({ error: 'Failed to update company settings' });
  }
});

/**
 * @swagger
 * /api/settings/appearance:
 *   put:
 *     summary: Update appearance settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [indigo, blue, green, purple, red]
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/appearance', [
  body('theme').isIn(['indigo', 'blue', 'green', 'purple', 'red']).withMessage('Invalid theme'),
  body('timezone').isString().withMessage('Timezone is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { theme, timezone } = req.body;

    await Promise.all([
      settingsService.setSetting('theme', theme, 'string', 'Application theme color'),
      settingsService.setSetting('timezone', timezone, 'string', 'Application timezone')
    ]);

    res.json({ message: 'Appearance settings updated successfully' });
  } catch (error) {
    console.error('Error updating appearance settings:', error);
    res.status(500).json({ error: 'Failed to update appearance settings' });
  }
});

/**
 * @swagger
 * /api/settings/notifications:
 *   put:
 *     summary: Update notification settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment_notifications:
 *                 type: boolean
 *               admin_email:
 *                 type: string
 *                 format: email
 *                 description: Admin email address for comment notifications
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/notifications', requireAdmin, [
  body('comment_notifications').isBoolean().withMessage('Comment notifications must be a boolean'),
  body('admin_email').optional().isEmail().withMessage('Admin email must be a valid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { comment_notifications, admin_email } = req.body;

    // Validate admin email if notifications are enabled
    if (comment_notifications && (!admin_email || admin_email.trim() === '')) {
      return res.status(400).json({ error: 'Admin email is required when comment notifications are enabled' });
    }

    await Promise.all([
      settingsService.setSetting('comment_notifications', comment_notifications, 'boolean', 'Send email notifications for new comments'),
      settingsService.setSetting('admin_email', admin_email || '', 'string', 'Admin email for comment notifications')
    ]);

    res.json({ message: 'Notification settings updated successfully' });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

router.put(
  '/changelog',
  requireAdmin,
  [
    body('changelog_max_image_size_bytes')
      .optional()
      .isInt({ min: 1024, max: 100 * 1024 * 1024 })
      .withMessage('Max image size must be between 1KB and 100MB'),
    body('changelog_max_images_per_entry')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Max images per entry must be between 1 and 50'),
    body('changelog_allowed_image_types')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Allowed types string is too long'),
    body('show_changelog_author_username').optional().isBoolean().withMessage('Must be a boolean')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const u = req.body;
      const ops = [];
      if (u.changelog_max_image_size_bytes !== undefined) {
        ops.push(
          settingsService.setSetting(
            'changelog_max_image_size_bytes',
            u.changelog_max_image_size_bytes,
            'number',
            'Max changelog image upload size in bytes'
          )
        );
      }
      if (u.changelog_max_images_per_entry !== undefined) {
        ops.push(
          settingsService.setSetting(
            'changelog_max_images_per_entry',
            u.changelog_max_images_per_entry,
            'number',
            'Max images per changelog entry'
          )
        );
      }
      if (u.changelog_allowed_image_types !== undefined) {
        ops.push(
          settingsService.setSetting(
            'changelog_allowed_image_types',
            u.changelog_allowed_image_types,
            'string',
            'Comma-separated allowed image extensions'
          )
        );
      }
      if (u.show_changelog_author_username !== undefined) {
        ops.push(
          settingsService.setSetting(
            'show_changelog_author_username',
            u.show_changelog_author_username,
            'boolean',
            'Show author username on public changelog'
          )
        );
      }
      if (ops.length === 0) {
        return res.status(400).json({ error: 'No changelog settings provided' });
      }
      await Promise.all(ops);
      res.json({ message: 'Changelog settings updated successfully' });
    } catch (error) {
      console.error('Error updating changelog settings:', error);
      res.status(500).json({ error: 'Failed to update changelog settings' });
    }
  }
);

/**
 * @swagger
 * /api/settings/logo:
 *   post:
 *     summary: Upload logo
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/logo', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' });
    }

    // Upload logo
    const uploadedFile = await fileStorage.uploadFile(req.file);
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Failed to upload logo' });
    }

    // Update logo URL setting
    await settingsService.setSetting('logo_url', uploadedFile.url, 'string', 'Logo URL');

    res.json({ 
      message: 'Logo uploaded successfully',
      logo_url: uploadedFile.url
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

/**
 * @swagger
 * /api/settings/test-smtp:
 *   post:
 *     summary: Test SMTP connection
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               test_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: SMTP test successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/test-smtp', requireAdmin, [
  body('test_email').isEmail().withMessage('Test email must be a valid email address')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { test_email } = req.body;

    // Initialize email service
    await emailService.initialize();

    if (!emailService.isConfigured) {
      return res.status(400).json({ error: 'SMTP is not properly configured' });
    }

    // Send test email
    const config = await settingsService.getAppConfig();
    const companyName = config.company.name || 'Release Log';
    const subject = `SMTP Test from ${companyName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">SMTP Test Successful!</h2>
        <p style="color: #666;">This is a test email to verify that your SMTP settings are working correctly.</p>
        <p style="color: #666;">Sent from: ${companyName}</p>
        <p style="color: #666;">Time: ${new Date().toLocaleString()}</p>
      </div>
    `;

    const success = await emailService.sendEmail(test_email, subject, html);

    if (success) {
      res.json({ message: 'SMTP test email sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test email' });
    }
  } catch (error) {
    console.error('Error testing SMTP:', error);
    res.status(500).json({ error: 'SMTP test failed' });
  }
});

module.exports = router; 