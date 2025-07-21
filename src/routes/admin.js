const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
const fileStorage = require('../services/fileStorage');
const bcrypt = require('bcryptjs');
const { adminRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  }
});

// Apply authentication and rate limiting to all admin routes
router.use(authenticateUser);
router.use(adminRateLimit);

const slugify = (str) => {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
};

async function getUniqueSlug(pool, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let i = 1;
  let query = 'SELECT id FROM changelogs WHERE slug = ?';
  let params = [slug];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  let [rows] = await pool.execute(query, params);
  while (rows.length > 0) {
    slug = `${baseSlug}-${i++}`;
    params[0] = slug;
    [rows] = await pool.execute(query, params);
  }
  return slug;
}

/**
 * @swagger
 * /api/admin/changelogs:
 *   get:
 *     summary: Get all changelogs (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, all]
 *         description: Filter by status
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
 *     responses:
 *       200:
 *         description: List of changelogs
 */
router.get('/changelogs', async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    let params = [];
    
    if (status !== 'all') {
      whereClause = 'WHERE c.status = ?';
      params.push(status);
    }
    
    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM changelogs c ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    
    // Get changelogs with author info
    const [changelogs] = await pool.execute(
      `SELECT c.*, u.username as author_name,
              (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote') as upvotes,
              (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote') as downvotes,
              (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) as comments
       FROM changelogs c
       LEFT JOIN users u ON c.author_id = u.id
       ${whereClause}
       ORDER BY c.created_at DESC
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
    console.error('Get changelogs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/changelogs:
 *   post:
 *     summary: Create new changelog
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - body
 *               - label
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               label:
 *                 type: string
 *                 enum: [feature, bug, optimization]
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Optional images to attach to the changelog
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *                 description: Changelog status (draft or published)
 *     responses:
 *       201:
 *         description: Changelog created successfully
 */
router.post('/changelogs', upload.array('images', 10), [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required and must be less than 255 characters'),
  body('body').trim().isLength({ min: 1 }).withMessage('Body is required'),
  body('label').isIn(['feature', 'bug', 'optimization']).withMessage('Label must be feature, bug, or optimization'),
  body('status').optional().isIn(['draft', 'published']).withMessage('Status must be draft or published')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, body, label } = req.body;
    let { status } = req.body;
    status = status || 'draft';
    const files = req.files || [];

    // Regular users can only create drafts
    if (!req.user.is_admin && status === 'published') {
      return res.status(403).json({ error: 'Regular users can only create drafts. Admin approval required for publishing.' });
    }

    // Generate unique slug
    const baseSlug = slugify(title);
    const slug = await getUniqueSlug(pool, baseSlug);

    // Create changelog
    const [result] = await pool.execute(
      'INSERT INTO changelogs (title, slug, body, label, status, author_id, published_at) VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = "published" THEN CURRENT_TIMESTAMP ELSE NULL END)',
      [title, slug, body, label, status, req.user.id, status]
    );

    const changelogId = result.insertId;

    // Upload images if provided
    const uploadedImages = [];
    for (const file of files) {
      try {
        const fileInfo = await fileStorage.uploadFile(file);
        
        // Skip if file upload returned null (empty file)
        if (!fileInfo) {
          continue;
        }
        
        const [imageResult] = await pool.execute(
          'INSERT INTO images (changelog_id, filename, original_name, mime_type, size, storage_type, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [changelogId, fileInfo.filename, fileInfo.originalName, fileInfo.mimeType, fileInfo.size, fileInfo.storageType, fileInfo.s3Key]
        );
        
        uploadedImages.push({
          id: imageResult.insertId,
          ...fileInfo
        });
      } catch (error) {
        console.error('Image upload failed:', error);
        // Continue with other files even if one fails
      }
    }

    // Get the created changelog with images
    const [changelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ?',
      [changelogId]
    );

    res.status(201).json({
      message: 'Changelog created successfully',
      changelog: {
        ...changelogs[0],
        images: uploadedImages
      }
    });

  } catch (error) {
    console.error('Create changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/changelogs/{id}:
 *   put:
 *     summary: Update changelog
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               label:
 *                 type: string
 *                 enum: [feature, bug, optimization]
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Optional images to attach to the changelog
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *                 description: Changelog status (draft or published)
 *     responses:
 *       200:
 *         description: Changelog updated successfully
 */
router.put('/changelogs/:id', upload.array('images', 10), [
  body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Title must be less than 255 characters'),
  body('body').optional().trim().isLength({ min: 1 }).withMessage('Body cannot be empty'),
  body('label').optional().isIn(['feature', 'bug', 'optimization']).withMessage('Label must be feature, bug, or optimization'),
  body('status').optional().isIn(['draft', 'published']).withMessage('Status must be draft or published')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { title, body, label, status } = req.body;
    const files = req.files || [];

    // Check if changelog exists and user has permission
    const [changelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ? AND author_id = ?',
      [id, req.user.id]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found or access denied' });
    }

    // Regular users can only update to draft status
    if (!req.user.is_admin && status === 'published') {
      return res.status(403).json({ error: 'Regular users can only save as drafts. Admin approval required for publishing.' });
    }

    // Update changelog
    const updateFields = [];
    const updateValues = [];
    
    if (title !== undefined) {
      const baseSlug = slugify(title);
      const slug = await getUniqueSlug(pool, baseSlug, id);
      updateFields.push('slug = ?');
      updateValues.push(slug);
    }
    if (body !== undefined) {
      updateFields.push('body = ?');
      updateValues.push(body);
    }
    if (label !== undefined) {
      updateFields.push('label = ?');
      updateValues.push(label);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
      
      // If status is being set to published, also set published_at
      if (status === 'published') {
        updateFields.push('published_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE changelogs SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        updateValues
      );
    }

    // Upload new images if provided
    const uploadedImages = [];
    for (const file of files) {
      try {
        const fileInfo = await fileStorage.uploadFile(file);
        
        // Skip if file upload returned null (empty file)
        if (!fileInfo) {
          continue;
        }
        
        const [imageResult] = await pool.execute(
          'INSERT INTO images (changelog_id, filename, original_name, mime_type, size, storage_type, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, fileInfo.filename, fileInfo.originalName, fileInfo.mimeType, fileInfo.size, fileInfo.storageType, fileInfo.s3Key]
        );
        
        uploadedImages.push({
          id: imageResult.insertId,
          ...fileInfo
        });
      } catch (error) {
        console.error('Image upload failed:', error);
        // Continue with other files even if one fails
      }
    }

    // Get updated changelog
    const [updatedChangelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ?',
      [id]
    );

    // Get existing images
    const [existingImages] = await pool.execute(
      'SELECT * FROM images WHERE changelog_id = ?',
      [id]
    );

    res.json({
      message: 'Changelog updated successfully',
      changelog: {
        ...updatedChangelogs[0],
        images: [...existingImages.map(img => ({
          ...img,
          url: fileStorage.getFileUrl(img)
        })), ...uploadedImages]
      }
    });

  } catch (error) {
    console.error('Update changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/changelogs/{id}/publish:
 *   post:
 *     summary: Publish changelog
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Changelog published successfully
 */
router.post('/changelogs/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if changelog exists and user has permission
    const [changelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ? AND author_id = ?',
      [id, req.user.id]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found or access denied' });
    }

    const changelog = changelogs[0];
    
    if (changelog.status === 'published') {
      return res.status(400).json({ error: 'Changelog is already published' });
    }

    // Publish changelog
    await pool.execute(
      'UPDATE changelogs SET status = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['published', id]
    );

    res.json({ message: 'Changelog published successfully' });

  } catch (error) {
    console.error('Publish changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/changelogs/{id}:
 *   delete:
 *     summary: Delete changelog
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Changelog deleted successfully
 */
router.delete('/changelogs/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if changelog exists and user has permission
    const [changelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ? AND author_id = ?',
      [id, req.user.id]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found or access denied' });
    }

    // Get images to delete from storage
    const [images] = await pool.execute(
      'SELECT * FROM images WHERE changelog_id = ?',
      [id]
    );

    // Delete images from storage
    for (const image of images) {
      await fileStorage.deleteFile(image);
    }

    // Delete changelog (cascade will handle related records)
    await pool.execute('DELETE FROM changelogs WHERE id = ?', [id]);

    res.json({ message: 'Changelog deleted successfully' });

  } catch (error) {
    console.error('Delete changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/changelogs/{id}/images/{imageId}:
 *   delete:
 *     summary: Delete image from changelog
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Image deleted successfully
 */
router.delete('/changelogs/:id/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const { id, imageId } = req.params;

    // Check if changelog exists and user has permission
    const [changelogs] = await pool.execute(
      'SELECT * FROM changelogs WHERE id = ? AND author_id = ?',
      [id, req.user.id]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found or access denied' });
    }

    // Get image to delete
    const [images] = await pool.execute(
      'SELECT * FROM images WHERE id = ? AND changelog_id = ?',
      [imageId, id]
    );

    if (images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = images[0];

    // Delete from storage
    await fileStorage.deleteFile(image);

    // Delete from database
    await pool.execute('DELETE FROM images WHERE id = ?', [imageId]);

    res.json({ message: 'Image deleted successfully' });

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/comments:
 *   get:
 *     summary: Get all comments (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [approved, pending, all]
 *         description: Filter by approval status
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
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of comments
 */
router.get('/comments', requireAdmin, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    let params = [];
    
    if (status !== 'all') {
      if (status === 'approved') {
        whereClause = 'WHERE c.is_approved = 1';
      } else if (status === 'pending') {
        whereClause = 'WHERE c.is_approved = 0';
      }
    }
    
    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM comments c ${whereClause}`,
      params
    );
    
    const total = countResult[0].total;
    
    // Get comments with changelog info
    const [comments] = await pool.execute(
      `SELECT c.*, ch.title as changelog_title, ch.id as changelog_id
       FROM comments c
       LEFT JOIN changelogs ch ON c.changelog_id = ch.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
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

/**
 * @swagger
 * /api/admin/comments/{id}/approve:
 *   post:
 *     summary: Approve comment
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Comment approved successfully
 */
router.post('/comments/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if comment exists
    const [comments] = await pool.execute(
      'SELECT * FROM comments WHERE id = ?',
      [id]
    );

    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Approve comment
    await pool.execute(
      'UPDATE comments SET is_approved = 1 WHERE id = ?',
      [id]
    );

    res.json({ message: 'Comment approved successfully' });

  } catch (error) {
    console.error('Approve comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/comments/{id}:
 *   delete:
 *     summary: Delete comment
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 */
router.delete('/comments/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if comment exists
    const [comments] = await pool.execute(
      'SELECT * FROM comments WHERE id = ?',
      [id]
    );

    if (comments.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Delete comment
    await pool.execute('DELETE FROM comments WHERE id = ?', [id]);

    res.json({ message: 'Comment deleted successfully' });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users (team members)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [all, admin, user]
 *         description: Filter by role
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
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       is_admin:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { role = 'all', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (role !== 'all') {
      whereClause = 'WHERE is_admin = ?';
      params.push(role === 'admin' ? 1 : 0);
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get users
    const [users] = await pool.execute(
      `SELECT id, username, email, is_admin, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const totalPages = Math.ceil(total / limit);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: totalPages
      }
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create a new user (team member)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/users', requireAdmin, [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .isIn(['admin', 'user'])
    .withMessage('Role must be either admin or user')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, role } = req.body;

    // Check if username or email already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create new user
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role === 'admin' ? 1 : 0]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: result.insertId,
        username,
        email,
        is_admin: role === 'admin'
      }
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: Update a user (team member)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put('/users/:id', requireAdmin, [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .isIn(['admin', 'user'])
    .withMessage('Role must be either admin or user')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);
    const { username, email, password, role } = req.body;

    // Check if user exists
    const [existingUser] = await pool.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username or email already exists (excluding current user)
    const [duplicateUsers] = await pool.execute(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
      [username, email, userId]
    );

    if (duplicateUsers.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Build update query
    let updateQuery = 'UPDATE users SET username = ?, email = ?, is_admin = ?';
    let params = [username, email, role === 'admin' ? 1 : 0];

    // Add password update if provided
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = ?';
      params.push(passwordHash);
    }

    updateQuery += ' WHERE id = ?';
    params.push(userId);

    await pool.execute(updateQuery, params);

    res.json({
      message: 'User updated successfully',
      user: {
        id: userId,
        username,
        email,
        is_admin: role === 'admin'
      }
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Delete a user (team member)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const [existingUser] = await pool.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 