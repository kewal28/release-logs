-- Release Log Database Schema
-- This file contains the complete database structure for the Release Log application

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS release_log CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE release_log;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Changelogs table
CREATE TABLE IF NOT EXISTS changelogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    label ENUM('feature', 'bug', 'optimization') NOT NULL,
    status ENUM('draft', 'published') DEFAULT 'draft',
    author_id INT NOT NULL,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    slug VARCHAR(255) UNIQUE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Images table
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
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    vote_type ENUM('upvote', 'downvote') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vote (changelog_id, ip_address)
);

-- Comments table
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
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'json', 'boolean', 'number') DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default admin user
INSERT IGNORE INTO users (username, email, password_hash, is_admin) VALUES 
('admin', 'admin@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1);

-- Insert default settings
INSERT IGNORE INTO settings (setting_key, setting_value, setting_type, description) VALUES
('company_name', 'Release Log', 'string', 'Company/Application Name'),
('logo_url', '', 'string', 'Logo URL'),
('theme', 'indigo', 'string', 'Application theme color'),
('timezone', 'UTC', 'string', 'Application timezone'),
('smtp_enabled', 'false', 'boolean', 'Enable SMTP for email notifications'),
('smtp_host', '', 'string', 'SMTP host'),
('smtp_port', '587', 'number', 'SMTP port'),
('smtp_user', '', 'string', 'SMTP username'),
('smtp_pass', '', 'string', 'SMTP password'),
('smtp_secure', 'true', 'boolean', 'Use secure SMTP connection'),
('s3_enabled', 'false', 'boolean', 'Enable S3 storage'),
('s3_bucket', '', 'string', 'S3 bucket name'),
('s3_region', 'us-east-1', 'string', 'S3 region'),
('s3_access_key', '', 'string', 'S3 access key'),
('s3_secret_key', '', 'string', 'S3 secret key'),
('s3_cloudfront_url', '', 'string', 'CloudFront URL (optional)'),
('comment_notifications', 'true', 'boolean', 'Send email notifications for new comments'),
('admin_email', '', 'string', 'Admin email for notifications');

-- Create indexes for better performance
CREATE INDEX idx_changelogs_status ON changelogs(status);
CREATE INDEX idx_changelogs_author ON changelogs(author_id);
CREATE INDEX idx_changelogs_created ON changelogs(created_at);
CREATE INDEX idx_votes_changelog ON votes(changelog_id);
CREATE INDEX idx_votes_ip ON votes(ip_address);
CREATE INDEX idx_comments_changelog ON comments(changelog_id);
CREATE INDEX idx_comments_approved ON comments(is_approved);
CREATE INDEX idx_images_changelog ON images(changelog_id);
CREATE INDEX idx_settings_key ON settings(setting_key);

-- Create views for easier querying
CREATE OR REPLACE VIEW published_changelogs AS
SELECT 
    c.*,
    u.username as author_name,
    (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote') as upvotes,
    (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote') as downvotes,
    (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) as comments
FROM changelogs c
LEFT JOIN users u ON c.author_id = u.id
WHERE c.status = 'published'
ORDER BY c.published_at DESC;

-- Create stored procedure for cleaning old data
DELIMITER //
CREATE PROCEDURE CleanOldData()
BEGIN
    -- Delete old unapproved comments (older than 30 days)
    DELETE FROM comments 
    WHERE is_approved = 0 
    AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Delete old votes (older than 1 year)
    DELETE FROM votes 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
END //
DELIMITER ;

-- Grant permissions (adjust as needed)
-- CREATE USER IF NOT EXISTS 'release_log_user'@'localhost' IDENTIFIED BY 'your_password';
-- GRANT ALL PRIVILEGES ON release_log.* TO 'release_log_user'@'localhost';
-- FLUSH PRIVILEGES; 