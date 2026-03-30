#!/usr/bin/env node
/**
 * Single entrypoint: create DB if needed, run bootstrap (tables + migrations).
 * Usage: node scripts/setup.js | npm run setup
 *        node scripts/setup.js slugs  — backfill unique slugs for changelogs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const path = require('path');

const slugify = (str) =>
  str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

<<<<<<< Current (Your changes)
async function createDatabaseIfNeeded() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  const dbName = process.env.DB_NAME || 'release_log';
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
  console.log(`📦 Database ready: ${dbName}`);
}
=======
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
        label VARCHAR(64) NOT NULL DEFAULT 'feature',
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
>>>>>>> Incoming (Background Agent changes)

async function runSlugBackfill() {
  const { pool } = require(path.join(__dirname, '..', 'src', 'config', 'database'));
  const [rows] = await pool.execute('SELECT id, title FROM changelogs');
  const usedSlugs = new Set();

  async function getUniqueSlug(baseSlug, excludeId) {
    let slug = baseSlug;
    let i = 1;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${i++}`;
    }
    let q = 'SELECT id FROM changelogs WHERE slug = ?';
    const params = [slug];
    if (excludeId) {
      q += ' AND id != ?';
      params.push(excludeId);
    }
    let [conflicts] = await pool.execute(q, params);
    while (conflicts.length > 0) {
      slug = `${baseSlug}-${i++}`;
      params[0] = slug;
      [conflicts] = await pool.execute(q, params);
    }
    usedSlugs.add(slug);
    return slug;
  }

  for (const row of rows) {
    let baseSlug = slugify(row.title) || `changelog-${row.id}`;
    const slug = await getUniqueSlug(baseSlug, row.id);
    await pool.execute('UPDATE changelogs SET slug = ? WHERE id = ?', [slug, row.id]);
    console.log(`Slug for #${row.id}: ${slug}`);
  }
  await pool.end();
  console.log('✅ Slug backfill done');
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'slugs') {
    await runSlugBackfill();
    return;
  }

  await createDatabaseIfNeeded();

  const { testConnection, initializeDatabase } = require(path.join(__dirname, '..', 'src', 'config', 'database'));
  await testConnection();
  await initializeDatabase();
  console.log('✅ Setup complete. Start with: npm start');
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
