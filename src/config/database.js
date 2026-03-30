const mysql = require('mysql2/promise');
require('dotenv').config();

const { migrateSchema } = require('./schemaMigrate');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'release_log',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

async function initializeDatabase() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        label VARCHAR(64) NOT NULL DEFAULT 'feature',
        status ENUM('draft', 'published') DEFAULT 'draft',
        author_id INT NOT NULL,
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        slug VARCHAR(255) UNIQUE,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        changelog_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size INT NOT NULL,
        storage_type ENUM('local', 's3') DEFAULT 'local',
        s3_key VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS votes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        changelog_id INT NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        vote_type ENUM('upvote', 'downvote') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
        UNIQUE KEY unique_vote (changelog_id, ip_address)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        changelog_id INT NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        author_email VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_type ENUM('string', 'json', 'boolean', 'number') DEFAULT 'string',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const [existingUsers] = await pool.execute('SELECT id FROM users WHERE username = ?', ['admin']);
    if (existingUsers.length === 0) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.execute(
        'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@example.com', hashedPassword, 1]
      );
      console.log('👤 Default admin user created (username: admin, password: admin123)');
    }

    await migrateSchema(pool);

    const defaultSettings = [
      { key: 'company_name', value: 'Release Log', type: 'string', description: 'Company/Application Name' },
      { key: 'logo_url', value: '', type: 'string', description: 'Logo URL' },
      { key: 'theme', value: 'indigo', type: 'string', description: 'Application theme color' },
      { key: 'timezone', value: 'UTC', type: 'string', description: 'Application timezone' },
      { key: 'smtp_enabled', value: 'false', type: 'boolean', description: 'Enable SMTP for email notifications' },
      { key: 'smtp_host', value: '', type: 'string', description: 'SMTP host' },
      { key: 'smtp_port', value: '587', type: 'number', description: 'SMTP port' },
      { key: 'smtp_user', value: '', type: 'string', description: 'SMTP username' },
      { key: 'smtp_pass', value: '', type: 'string', description: 'SMTP password' },
      { key: 'smtp_secure', value: 'true', type: 'boolean', description: 'Use secure SMTP connection' },
      { key: 's3_enabled', value: 'false', type: 'boolean', description: 'Enable S3 storage' },
      { key: 's3_bucket', value: '', type: 'string', description: 'S3 bucket name' },
      { key: 's3_region', value: 'us-east-1', type: 'string', description: 'S3 region' },
      { key: 's3_access_key', value: '', type: 'string', description: 'S3 access key' },
      { key: 's3_secret_key', value: '', type: 'string', description: 'S3 secret key' },
      { key: 's3_cloudfront_url', value: '', type: 'string', description: 'CloudFront URL (optional)' },
      { key: 'comment_notifications', value: 'true', type: 'boolean', description: 'Send email notifications for new comments' },
      { key: 'admin_email', value: '', type: 'string', description: 'Admin email for notifications' },
      { key: 'changelog_max_image_size_bytes', value: String(5 * 1024 * 1024), type: 'number', description: 'Max changelog image upload size in bytes' },
      { key: 'changelog_max_images_per_entry', value: '10', type: 'number', description: 'Max images per changelog entry' },
      { key: 'changelog_allowed_image_types', value: 'jpg,jpeg,png,gif,webp', type: 'string', description: 'Comma-separated allowed image extensions/MIME types' },
      { key: 'show_changelog_author_username', value: 'false', type: 'boolean', description: 'Show author username on public changelog' }
    ];

    for (const setting of defaultSettings) {
      await pool.execute(
        'INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
        [setting.key, setting.value, setting.type, setting.description]
      );
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

module.exports = {
  pool,
  testConnection,
  initializeDatabase
};
