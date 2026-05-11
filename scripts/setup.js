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
