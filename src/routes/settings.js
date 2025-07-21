const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { authenticateUser, requireAdmin } = require('../middleware/auth');
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
    const config = await settingsService.getAppConfig();
    const themes = settingsService.getAvailableThemes();
    const timezones = settingsService.getAvailableTimezones();
    
    res.json({
      config,
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
 * /api/settings/smtp:
 *   put:
 *     summary: Update SMTP settings
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
 *               enabled:
 *                 type: boolean
 *               host:
 *                 type: string
 *               port:
 *                 type: number
 *               user:
 *                 type: string
 *                 description: SMTP username (for AWS SES, this is your Access Key ID)
 *               pass:
 *                 type: string
 *               secure:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/smtp', requireAdmin, [
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  body('host').optional().isString().withMessage('Host must be a string'),
  body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Port must be a valid port number'),
  body('user').optional().isString().withMessage('User must be a string'),
  body('pass').optional().isString().withMessage('Password must be a string'),
  body('secure').optional().isBoolean().withMessage('Secure must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { enabled, host, port, user, pass, secure } = req.body;

    // If SMTP is being enabled, validate required fields
    if (enabled) {
      const validation = settingsService.validateSMTPSettings({ host, port, user, pass });
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'SMTP validation failed',
          details: validation.errors 
        });
      }
    }

    await Promise.all([
      settingsService.setSetting('smtp_enabled', enabled, 'boolean', 'Enable SMTP for email notifications'),
      settingsService.setSetting('smtp_host', host || '', 'string', 'SMTP host'),
      settingsService.setSetting('smtp_port', port || 587, 'number', 'SMTP port'),
      settingsService.setSetting('smtp_user', user || '', 'string', 'SMTP username'),
      settingsService.setSetting('smtp_pass', pass || '', 'string', 'SMTP password'),
      settingsService.setSetting('smtp_secure', secure !== false, 'boolean', 'Use secure SMTP connection')
    ]);

    // Reinitialize email service
    await emailService.reinitialize();

    res.json({ 
      message: 'SMTP settings updated successfully',
      emailStatus: emailService.getStatus()
    });
  } catch (error) {
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({ error: 'Failed to update SMTP settings' });
  }
});

/**
 * @swagger
 * /api/settings/s3:
 *   put:
 *     summary: Update S3 settings
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
 *               enabled:
 *                 type: boolean
 *               bucket:
 *                 type: string
 *               region:
 *                 type: string
 *               access_key:
 *                 type: string
 *               secret_key:
 *                 type: string
 *               cloudfront_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/s3', requireAdmin, [
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  body('bucket').optional().isString().withMessage('Bucket must be a string'),
  body('region').optional().isString().withMessage('Region must be a string'),
  body('access_key').optional().isString().withMessage('Access key must be a string'),
  body('secret_key').optional().isString().withMessage('Secret key must be a string'),
  body('cloudfront_url').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    // Only validate URL if a value is provided
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(value)) {
      throw new Error('CloudFront URL must be a valid URL');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { enabled, bucket, region, access_key, secret_key, cloudfront_url } = req.body;

    // If S3 is being enabled, validate required fields
    if (enabled) {
      const validation = settingsService.validateS3Settings({ bucket, region, access_key, secret_key });
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'S3 validation failed',
          details: validation.errors 
        });
      }
    }

    await Promise.all([
      settingsService.setSetting('s3_enabled', enabled, 'boolean', 'Enable S3 storage'),
      settingsService.setSetting('s3_bucket', bucket || '', 'string', 'S3 bucket name'),
      settingsService.setSetting('s3_region', region || 'us-east-1', 'string', 'S3 region'),
      settingsService.setSetting('s3_access_key', access_key || '', 'string', 'S3 access key'),
      settingsService.setSetting('s3_secret_key', secret_key || '', 'string', 'S3 secret key'),
      settingsService.setSetting('s3_cloudfront_url', cloudfront_url || '', 'string', 'CloudFront URL (optional)')
    ]);

    // Reinitialize file storage service
    await fileStorage.reinitializeS3();

    res.json({ message: 'S3 settings updated successfully' });
  } catch (error) {
    console.error('Error updating S3 settings:', error);
    res.status(500).json({ error: 'Failed to update S3 settings' });
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