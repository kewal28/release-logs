/**
 * Run incremental schema upgrades (projects, project_id, i18n tables, etc.)
 * without re-seeding the database. Safe to run multiple times.
 */
require('dotenv').config();

const { pool } = require('../src/config/database');
const { migrateSchema } = require('../src/config/schemaMigrate');

migrateSchema(pool)
  .then(() => {
    console.log('Schema migration finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
