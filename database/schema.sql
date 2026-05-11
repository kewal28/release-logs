-- Release Log — reference schema (utf8mb4).
-- New installs: prefer starting the app once (`npm start`) so `initializeDatabase()` + `migrateSchema()` run,
-- or run `npm run migrate` after the database exists.

CREATE DATABASE IF NOT EXISTS release_log CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE release_log;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(128) NULL,
    is_admin TINYINT(1) DEFAULT 0,
    email_verified TINYINT(1) NOT NULL DEFAULT 1,
    verification_token_hash VARCHAR(64) NULL,
    verification_token_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    public_key VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_projects_public_key (public_key),
    KEY idx_projects_user (user_id),
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_users (
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    KEY idx_pu_user (user_id),
    CONSTRAINT fk_pu_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS changelogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    label VARCHAR(64) NOT NULL DEFAULT 'feature',
    status ENUM('draft', 'published') DEFAULT 'draft',
    author_id INT NOT NULL,
    project_id INT NOT NULL,
    published_at TIMESTAMP NULL,
    release_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    slug VARCHAR(255) UNIQUE,
    view_count INT NOT NULL DEFAULT 0,
    upvote_count INT NOT NULL DEFAULT 0,
    downvote_count INT NOT NULL DEFAULT 0,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_changelogs_release_date ON changelogs (release_date);

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

CREATE TABLE IF NOT EXISTS votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    vote_type ENUM('upvote', 'downvote') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vote (changelog_id, ip_address)
);

CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    parent_id INT NULL,
    user_id INT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_email VARCHAR(255) NULL,
    content TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    KEY idx_comments_parent (parent_id)
);

CREATE TABLE IF NOT EXISTS project_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    slug VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    color VARCHAR(32) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_project_slug (project_id, slug),
    CONSTRAINT fk_pl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS changelog_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    changelog_id INT NOT NULL,
    locale VARCHAR(16) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    UNIQUE KEY uk_changelog_locale (changelog_id, locale),
    CONSTRAINT fk_ct_changelog FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'json', 'boolean', 'number') DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Default admin (password: password — replace in production; bcrypt hash below is Laravel-style placeholder)
INSERT IGNORE INTO users (username, email, password_hash, is_admin) VALUES
('admin', 'admin@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1);

-- One default project per admin user (opaque public_key) so changelogs can reference project_id
INSERT INTO projects (user_id, name, public_key)
SELECT u.id, 'Default project', LOWER(CONCAT(SUBSTRING(MD5(CONCAT(u.id, 'salt')), 1, 16), SUBSTRING(MD5(CONCAT(u.email, 'pk')), 1, 8)))
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id);

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
('admin_email', '', 'string', 'Admin email for notifications'),
('changelog_max_image_size_bytes', '5242880', 'number', 'Max changelog image upload size in bytes'),
('changelog_max_images_per_entry', '10', 'number', 'Max images per changelog entry'),
('changelog_allowed_image_types', 'jpg,jpeg,png,gif,webp', 'string', 'Comma-separated allowed image extensions'),
('show_changelog_author_username', 'false', 'boolean', 'Show author username on public changelog');

CREATE INDEX idx_changelogs_status ON changelogs(status);
CREATE INDEX idx_changelogs_author ON changelogs(author_id);
CREATE INDEX idx_changelogs_project ON changelogs(project_id);
CREATE INDEX idx_changelogs_created ON changelogs(created_at);
CREATE INDEX idx_votes_changelog ON votes(changelog_id);
CREATE INDEX idx_votes_ip ON votes(ip_address);
CREATE INDEX idx_comments_changelog ON comments(changelog_id);
CREATE INDEX idx_comments_approved ON comments(is_approved);
CREATE INDEX idx_images_changelog ON images(changelog_id);
CREATE INDEX idx_settings_key ON settings(setting_key);

CREATE OR REPLACE VIEW published_changelogs AS
SELECT
    c.*,
    u.username AS author_name,
    COALESCE(c.upvote_count, 0) AS upvotes,
    COALESCE(c.downvote_count, 0) AS downvotes,
    (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) AS comments
FROM changelogs c
LEFT JOIN users u ON c.author_id = u.id
WHERE c.status = 'published'
ORDER BY c.published_at DESC;

DELIMITER //
CREATE PROCEDURE CleanOldData()
BEGIN
    DELETE FROM comments
    WHERE is_approved = 0
    AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

    DELETE FROM votes
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
END //
DELIMITER ;
