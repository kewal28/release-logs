const { pool } = require('../config/database');
const cache = require('./cache');

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  getSmtpFromEnv() {
    const host = process.env.SMTP_HOST || '';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const secure = process.env.SMTP_SECURE !== 'false' && process.env.SMTP_SECURE !== '0';
    const from = process.env.SMTP_FROM || user;
    const enabled =
      process.env.SMTP_ENABLED === 'true' ||
      process.env.SMTP_ENABLED === '1' ||
      (!!host && !!user && !!pass);
    return { enabled, host, port, user, pass, secure, from };
  }

  getS3FromEnv() {
    const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || '';
    const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
    const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const cloudfrontUrl = (process.env.AWS_CLOUDFRONT_DOMAIN || '').replace(/^https?:\/\//, '');
    const enabled =
      process.env.S3_ENABLED === 'true' ||
      process.env.S3_ENABLED === '1' ||
      (!!bucket && !!accessKey && !!secretKey);
    return {
      enabled,
      bucket,
      region,
      accessKey,
      secretKey,
      cloudfrontUrl
    };
  }

  async invalidatePublicCache() {
    await cache.del(cache.publicSettingsKey);
  }

  /**
   * Get a setting value by key
   */
  async getSetting(key, defaultValue = null) {
    try {
      // Check cache first
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.value;
      }

      const [rows] = await pool.execute(
        'SELECT setting_value, setting_type FROM settings WHERE setting_key = ?',
        [key]
      );

      if (rows.length === 0) {
        return defaultValue;
      }

      const setting = rows[0];
      let value = setting.setting_value;

      // Convert value based on type
      switch (setting.setting_type) {
        case 'boolean':
          value = value === 'true' || value === '1';
          break;
        case 'number':
          value = parseFloat(value) || 0;
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            value = defaultValue;
          }
          break;
        default:
          // string type - no conversion needed
          break;
      }

      // Cache the result
      this.cache.set(key, {
        value,
        timestamp: Date.now()
      });

      return value;
    } catch (error) {
      console.error('Error getting setting:', error);
      return defaultValue;
    }
  }

  /**
   * Set a setting value
   */
  async setSetting(key, value, type = 'string', description = null) {
    try {
      let stringValue = value;

      // Convert value to string based on type
      switch (type) {
        case 'boolean':
          stringValue = value ? 'true' : 'false';
          break;
        case 'number':
          stringValue = value.toString();
          break;
        case 'json':
          stringValue = JSON.stringify(value);
          break;
        default:
          stringValue = value.toString();
          break;
      }

      await pool.execute(
        `INSERT INTO settings (setting_key, setting_value, setting_type, description) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         setting_value = VALUES(setting_value), 
         setting_type = VALUES(setting_type),
         description = VALUES(description),
         updated_at = CURRENT_TIMESTAMP`,
        [key, stringValue, type, description]
      );

      // Clear cache for this key
      this.cache.delete(key);
      if (['company_name', 'logo_url', 'theme', 'timezone'].includes(key)) {
        await this.invalidatePublicCache();
      }

      return true;
    } catch (error) {
      console.error('Error setting setting:', error);
      return false;
    }
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    try {
      const [rows] = await pool.execute('SELECT * FROM settings ORDER BY setting_key');
      const settings = {};

      for (const row of rows) {
        let value = row.setting_value;

        // Convert value based on type
        switch (row.setting_type) {
          case 'boolean':
            value = value === 'true' || value === '1';
            break;
          case 'number':
            value = parseFloat(value) || 0;
            break;
          case 'json':
            try {
              value = JSON.parse(value);
            } catch (e) {
              value = null;
            }
            break;
          default:
            // string type - no conversion needed
            break;
        }

        settings[row.setting_key] = {
          value,
          type: row.setting_type,
          description: row.description,
          updated_at: row.updated_at
        };
      }

      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  /**
   * Get application configuration
   */
  async getAppConfig(options = {}) {
    const { maskSecrets = false } = options;
    const [
      companyName,
      logoUrl,
      theme,
      timezone,
      commentNotifications,
      adminEmail,
      changelogMaxImageSizeBytes,
      changelogMaxImagesPerEntry,
      changelogAllowedImageTypes,
      showChangelogAuthorUsername
    ] = await Promise.all([
      this.getSetting('company_name', 'Release Log'),
      this.getSetting('logo_url', ''),
      this.getSetting('theme', 'indigo'),
      this.getSetting('timezone', 'UTC'),
      this.getSetting('comment_notifications', true),
      this.getSetting('admin_email', ''),
      this.getSetting('changelog_max_image_size_bytes', 5 * 1024 * 1024),
      this.getSetting('changelog_max_images_per_entry', 10),
      this.getSetting('changelog_allowed_image_types', 'jpg,jpeg,png,gif,webp'),
      this.getSetting('show_changelog_author_username', false)
    ]);

    const smtp = this.getSmtpFromEnv();
    const s3 = this.getS3FromEnv();

    if (maskSecrets) {
      smtp.pass = smtp.pass ? '********' : '';
      s3.secretKey = s3.secretKey ? '********' : '';
      s3.accessKey = s3.accessKey ? '********' : '';
    }

    return {
      company: {
        name: companyName,
        logo: logoUrl
      },
      appearance: {
        theme,
        timezone
      },
      smtp,
      s3,
      notifications: {
        comments: commentNotifications,
        adminEmail: adminEmail
      },
      changelog: {
        maxImageSizeBytes: changelogMaxImageSizeBytes,
        maxImagesPerEntry: changelogMaxImagesPerEntry,
        allowedImageTypes: changelogAllowedImageTypes,
        showAuthorUsername: showChangelogAuthorUsername
      }
    };
  }

  /** Cached subset for public API */
  async getPublicAppSettings() {
    const ttl = parseInt(process.env.CACHE_PUBLIC_SETTINGS_TTL || '120', 10);
    const hit = await cache.getJson(cache.publicSettingsKey);
    if (hit) return hit;
    const config = await this.getAppConfig();
    const publicSettings = {
      company: config.company,
      appearance: config.appearance
    };
    await cache.setJson(cache.publicSettingsKey, publicSettings, ttl);
    return publicSettings;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Validate SMTP settings
   */
  validateSMTPSettings(smtpConfig) {
    const errors = [];

    if (!smtpConfig.host) errors.push('SMTP host is required');
    if (!smtpConfig.port) errors.push('SMTP port is required');
    if (!smtpConfig.user) errors.push('SMTP username is required');
    if (!smtpConfig.pass) errors.push('SMTP password is required');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate S3 settings
   */
  validateS3Settings(s3Config) {
    const errors = [];

    if (!s3Config.bucket) errors.push('S3 bucket name is required');
    if (!s3Config.region) errors.push('S3 region is required');
    if (!s3Config.accessKey) errors.push('S3 access key is required');
    if (!s3Config.secretKey) errors.push('S3 secret key is required');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available themes
   */
  getAvailableThemes() {
    return [
      { value: 'indigo', name: 'Indigo', color: '#4F46E5' },
      { value: 'blue', name: 'Blue', color: '#2563EB' },
      { value: 'green', name: 'Green', color: '#059669' },
      { value: 'purple', name: 'Purple', color: '#7C3AED' },
      { value: 'red', name: 'Red', color: '#DC2626' }
    ];
  }

  /**
   * Get available timezones
   */
  getAvailableTimezones() {
    return [
      { value: 'UTC', name: 'UTC (Coordinated Universal Time)' },
      { value: 'America/New_York', name: 'Eastern Time (ET)' },
      { value: 'America/Chicago', name: 'Central Time (CT)' },
      { value: 'America/Denver', name: 'Mountain Time (MT)' },
      { value: 'America/Los_Angeles', name: 'Pacific Time (PT)' },
      { value: 'Europe/London', name: 'London (GMT)' },
      { value: 'Europe/Paris', name: 'Paris (CET)' },
      { value: 'Asia/Kolkata', name: 'India (IST)' },
      { value: 'Asia/Tokyo', name: 'Tokyo (JST)' },
      { value: 'Asia/Shanghai', name: 'Shanghai (CST)' },
      { value: 'Australia/Sydney', name: 'Sydney (AEDT)' }
    ];
  }
}

module.exports = new SettingsService(); 