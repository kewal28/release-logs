const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { publicRateLimit, voteRateLimit, commentRateLimit } = require('../middleware/rateLimit');
const { optionalAuth } = require('../middleware/auth');
const Filter = require('bad-words');
const fileStorage = require('../services/fileStorage');
const settingsService = require('../services/settings');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * @swagger
 * /api/public/settings:
 *   get:
 *     summary: Get public application settings
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Application settings for public display
 */
router.get('/public/settings', async (req, res) => {
  try {
    const config = await settingsService.getAppConfig();
    
    // Only return public settings (company info and appearance)
    const publicSettings = {
      company: config.company,
      appearance: config.appearance
    };
    
    res.json({ config: publicSettings });
  } catch (error) {
    console.error('Error getting public settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Initialize profanity filter
const filter = new Filter();

// Apply rate limiting to public routes
router.use(publicRateLimit);

// Test endpoint to check if changelogs exist
router.get('/test-changelogs', async (req, res) => {
  try {
    const [changelogs] = await pool.execute(
      'SELECT id, title, status, created_at, published_at FROM changelogs LIMIT 5'
    );
    res.json({ 
      message: 'Test endpoint working',
      changelogs: changelogs,
      total: changelogs.length
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Fix published changelogs with null published_at
router.get('/fix-published-dates', async (req, res) => {
  try {
    const [result] = await pool.execute(
      'UPDATE changelogs SET published_at = created_at WHERE status = "published" AND published_at IS NULL'
    );
    res.json({ 
      message: 'Fixed published dates',
      updated: result.affectedRows
    });
  } catch (error) {
    console.error('Fix dates error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * @swagger
 * /api/changelogs:
 *   get:
 *     summary: Get published changelogs
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: label
 *         schema:
 *           type: string
 *           enum: [feature, bug, optimization]
 *         description: Filter by label
 *     responses:
 *       200:
 *         description: List of published changelogs
 */
router.get('/changelogs', async (req, res) => {
  try {
    const { page = 1, limit = 10, label } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE c.status = ?';
    let params = ['published'];
    
    if (label) {
      whereClause += ' AND c.label = ?';
      params.push(label);
    }
    
    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM changelogs c ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    
    // Get published changelogs with stats
    const [changelogs] = await pool.execute(
      `SELECT c.*, u.username as author_name,
              (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote') as upvotes,
              (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote') as downvotes,
              (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) as comments
       FROM changelogs c
       LEFT JOIN users u ON c.author_id = u.id
       ${whereClause}
       ORDER BY c.published_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    
    // Get images for each changelog
    for (let changelog of changelogs) {
      const [images] = await pool.execute(
        'SELECT * FROM images WHERE changelog_id = ?',
        [changelog.id]
      );
      changelog.images = images.map(img => ({
        ...img,
        url: fileStorage.getFileUrl(img)
      }));
    }
    
    res.json({
      changelogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get public changelogs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/changelogs/{id}:
 *   get:
 *     summary: Get specific changelog
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Changelog details
 *       404:
 *         description: Changelog not found
 */
router.get('/changelogs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let changelogs;
    if (/^\d+$/.test(id)) {
      // Numeric ID
      [changelogs] = await pool.execute(
        `SELECT c.*, u.username as author_name,
                (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote') as upvotes,
                (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote') as downvotes,
                (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) as comments
         FROM changelogs c
         LEFT JOIN users u ON c.author_id = u.id
         WHERE c.id = ? AND c.status = ?`,
        [id, 'published']
      );
    } else {
      // Slug
      [changelogs] = await pool.execute(
        `SELECT c.*, u.username as author_name,
                (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote') as upvotes,
                (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote') as downvotes,
                (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) as comments
         FROM changelogs c
         LEFT JOIN users u ON c.author_id = u.id
         WHERE c.slug = ? AND c.status = ?`,
        [id, 'published']
      );
    }
    
    console.log('Raw changelog data:', changelogs[0]);
    
    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }
    
    const changelog = changelogs[0];
    
    // Get images
    const [images] = await pool.execute(
      'SELECT * FROM images WHERE changelog_id = ?',
      [id]
    );
    changelog.images = images.map(img => ({
      ...img,
      url: fileStorage.getFileUrl(img)
    }));
    
    // Get approved comments
    const [comments] = await pool.execute(
      'SELECT id, author_name, content, created_at FROM comments WHERE changelog_id = ? AND is_approved = 1 ORDER BY created_at DESC',
      [id]
    );
    changelog.comments_list = comments;
    
    res.json({ changelog });
    
  } catch (error) {
    console.error('Get changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/changelogs/{id}/vote:
 *   post:
 *     summary: Vote on changelog
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vote_type
 *             properties:
 *               vote_type:
 *                 type: string
 *                 enum: [upvote, downvote]
 *     responses:
 *       200:
 *         description: Vote recorded successfully
 */
router.post('/changelogs/:id/vote', express.json(), voteRateLimit, [
  body('vote_type').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { vote_type } = req.body;
    const ipAddress = req.ip;

    // Check if changelog exists and is published
    const [changelogs] = await pool.execute(
      'SELECT id FROM changelogs WHERE id = ? AND status = ?',
      [id, 'published']
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }

    // Check if user already voted
    const [existingVotes] = await pool.execute(
      'SELECT id, vote_type FROM votes WHERE changelog_id = ? AND ip_address = ?',
      [id, ipAddress]
    );

    if (existingVotes.length > 0) {
      const existingVote = existingVotes[0];
      if (existingVote.vote_type === vote_type) {
        // Remove vote if same type (toggle off)
        await pool.execute(
          'DELETE FROM votes WHERE changelog_id = ? AND ip_address = ?',
          [id, ipAddress]
        );
        res.json({ message: 'Vote removed', action: 'removed' });
      } else {
        // Update vote if different type
        await pool.execute(
          'UPDATE votes SET vote_type = ? WHERE changelog_id = ? AND ip_address = ?',
          [vote_type, id, ipAddress]
        );
        res.json({ message: 'Vote updated', action: 'updated' });
      }
    } else {
      // Create new vote
      await pool.execute(
        'INSERT INTO votes (changelog_id, ip_address, vote_type) VALUES (?, ?, ?)',
        [id, ipAddress, vote_type]
      );
      res.json({ message: 'Vote recorded', action: 'created' });
    }

  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/changelogs/{id}/comments:
 *   post:
 *     summary: Add comment to changelog
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - author_name
 *               - author_email
 *               - content
 *             properties:
 *               author_name:
 *                 type: string
 *                 maxLength: 100
 *               author_email:
 *                 type: string
 *                 format: email
 *               content:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Comment added successfully
 */
router.post('/changelogs/:id/comments', commentRateLimit, [
  body('author_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Author name is required and must be less than 100 characters'),
  body('author_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Content is required and must be less than 1000 characters'),
  body(process.env.HONEYPOT_FIELD_NAME || '_gotcha')
    .optional()
    .isEmpty()
    .withMessage('Honeypot field should be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { author_name, author_email, content } = req.body;
    const ipAddress = req.ip;

    // Check if changelog exists and is published
    const [changelogs] = await pool.execute(
      'SELECT id FROM changelogs WHERE id = ? AND status = ?',
      [id, 'published']
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }

    // Check rate limiting for comments per IP
    const maxCommentsPerIp = parseInt(process.env.MAX_COMMENTS_PER_IP) || 10;
    const [commentCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM comments WHERE ip_address = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
      [ipAddress]
    );

    if (commentCount[0].count >= maxCommentsPerIp) {
      return res.status(429).json({ error: 'Too many comments from this IP address' });
    }

    // Filter profanity
    const filteredContent = filter.clean(content);
    const filteredAuthorName = filter.clean(author_name);

    // Check if comment contains profanity
    const isProfane = filteredContent !== content || filteredAuthorName !== author_name;

    // Create comment
    const [result] = await pool.execute(
      'INSERT INTO comments (changelog_id, author_name, author_email, content, ip_address, is_approved) VALUES (?, ?, ?, ?, ?, ?)',
      [id, filteredAuthorName, author_email || null, filteredContent, ipAddress, !isProfane]
    );

    // Send email notification if enabled
    try {
      const config = await settingsService.getAppConfig();
      if (config.notifications.comments && emailService.isConfigured) {
        const commentData = {
          id: result.insertId,
          author_name: filteredAuthorName,
          author_email: author_email || null,
          content: filteredContent,
          created_at: new Date()
        };
        
        // Get changelog details for email
        const [changelogRows] = await pool.execute(
          'SELECT id, title FROM changelogs WHERE id = ?',
          [id]
        );
        
        if (changelogRows.length > 0) {
          await emailService.sendCommentNotification(commentData, changelogRows[0]);
        }
      }
    } catch (emailError) {
      console.error('Error sending comment notification:', emailError);
      // Don't fail the comment submission if email fails
    }

    res.status(201).json({
      message: isProfane ? 'Comment submitted for review' : 'Comment added successfully',
      comment: {
        id: result.insertId,
        author_name: filteredAuthorName,
        content: filteredContent,
        is_approved: !isProfane,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/changelogs/{id}/comments:
 *   get:
 *     summary: Get comments for changelog
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of approved comments
 */
router.get('/changelogs/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if changelog exists and is published (by ID or slug)
    let changelogRow;
    if (/^\d+$/.test(id)) {
      [[changelogRow]] = await pool.execute(
        'SELECT id FROM changelogs WHERE id = ? AND status = ?',
        [id, 'published']
      );
    } else {
      [[changelogRow]] = await pool.execute(
        'SELECT id FROM changelogs WHERE slug = ? AND status = ?',
        [id, 'published']
      );
    }

    if (!changelogRow || !changelogRow.id) {
      return res.status(404).json({ error: 'Changelog not found' });
    }
    const changelogId = changelogRow.id;

    // Get total count
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM comments WHERE changelog_id = ? AND is_approved = 1',
      [changelogId]
    );

    const total = countResult[0].total;

    // Get approved comments
    const [comments] = await pool.execute(
      'SELECT id, author_name, content, created_at FROM comments WHERE changelog_id = ? AND is_approved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [changelogId, parseInt(limit), offset]
    );

    res.json({
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 