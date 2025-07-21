const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupDatabase() {
  let connection;
  
  try {
    console.log('🚀 Setting up Release Log database...');
    
    // Connect to MySQL server (without specifying database)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    const dbName = process.env.DB_NAME || 'release_log_db';
    
    // Create database if it doesn't exist
    console.log(`📦 Creating database: ${dbName}`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    await connection.query(`USE ${dbName}`);

    // Create tables
    console.log('📋 Creating tables...');
    
    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Changelogs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        label ENUM('feature', 'bug', 'optimization') NOT NULL,
        status ENUM('draft', 'published') DEFAULT 'draft',
        author_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        published_at TIMESTAMP NULL,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Images table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS images (
        id INT PRIMARY KEY AUTO_INCREMENT,
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

    // Votes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        changelog_id INT NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        vote_type ENUM('upvote', 'downvote') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
        UNIQUE KEY unique_vote (changelog_id, ip_address)
      )
    `);

    // Comments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        changelog_id INT NOT NULL,
        author_name VARCHAR(100) NOT NULL,
        author_email VARCHAR(100) NULL,
        content TEXT NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        is_approved BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    console.log('⚡ Creating indexes...');
    await connection.query('CREATE INDEX idx_changelogs_status ON changelogs(status)');
    await connection.query('CREATE INDEX idx_changelogs_author ON changelogs(author_id)');
    await connection.query('CREATE INDEX idx_votes_changelog ON votes(changelog_id)');
    await connection.query('CREATE INDEX idx_comments_changelog ON comments(changelog_id)');
    await connection.query('CREATE INDEX idx_comments_approved ON comments(is_approved)');

    // Create default admin user if no users exist
    const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
    
    if (users[0].count === 0) {
      console.log('👤 Creating default admin user...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await connection.query(`
        INSERT INTO users (username, email, password_hash, is_admin) 
        VALUES (?, ?, ?, ?)
      `, ['admin', 'admin@example.com', hashedPassword, true]);
      
      console.log('✅ Default admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   Email: admin@example.com');
      console.log('⚠️  Please change these credentials after first login!');
    }

    console.log('✅ Database setup completed successfully!');
    console.log(`📊 Database: ${dbName}`);
    console.log(`🌐 Server will run on port: ${process.env.PORT || 3000}`);

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase; 