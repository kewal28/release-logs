const crypto = require('crypto');

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

function generatePublicKey() {
  return crypto.randomBytes(18).toString('base64url').replace(/=/g, '').slice(0, 24);
}

async function migrateSchema(pool) {
  // projects
  if (!(await tableExists(pool, 'projects'))) {
    await pool.execute(`
      CREATE TABLE projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        public_key VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_projects_public_key (public_key),
        KEY idx_projects_user (user_id),
        CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await columnExists(pool, 'changelogs', 'slug'))) {
    await pool.execute('ALTER TABLE changelogs ADD COLUMN slug VARCHAR(255) NULL UNIQUE');
  }

  if (!(await columnExists(pool, 'changelogs', 'project_id'))) {
    await pool.execute('ALTER TABLE changelogs ADD COLUMN project_id INT NULL');
  }

  if (!(await columnExists(pool, 'changelogs', 'view_count'))) {
    await pool.execute('ALTER TABLE changelogs ADD COLUMN view_count INT NOT NULL DEFAULT 0');
  }

  if (!(await columnExists(pool, 'changelogs', 'upvote_count'))) {
    await pool.execute('ALTER TABLE changelogs ADD COLUMN upvote_count INT NOT NULL DEFAULT 0');
  }

  if (!(await columnExists(pool, 'changelogs', 'downvote_count'))) {
    await pool.execute('ALTER TABLE changelogs ADD COLUMN downvote_count INT NOT NULL DEFAULT 0');
  }

  // label column: widen to VARCHAR for custom labels + upcoming
  try {
    await pool.execute(`
      ALTER TABLE changelogs MODIFY COLUMN label VARCHAR(64) NOT NULL
    `);
  } catch (e) {
    /* may already be varchar */
  }

  await pool.execute(`UPDATE changelogs SET label = 'upcoming' WHERE label = 'optimization'`);

  // Ensure every user has at least one project
  const [allUsers] = await pool.execute('SELECT id FROM users');
  for (const row of allUsers) {
    const [projs] = await pool.execute('SELECT id FROM projects WHERE user_id = ? LIMIT 1', [row.id]);
    if (projs.length === 0) {
      let key = generatePublicKey();
      let tries = 0;
      while (tries < 5) {
        try {
          await pool.execute(
            'INSERT INTO projects (user_id, name, public_key) VALUES (?, ?, ?)',
            [row.id, 'Default project', key]
          );
          break;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            key = generatePublicKey();
            tries += 1;
          } else {
            throw err;
          }
        }
      }
    }
  }

  // Backfill changelogs.project_id from author's default project
  const [orphans] = await pool.execute(
    'SELECT id, author_id FROM changelogs WHERE project_id IS NULL'
  );
  for (const ch of orphans) {
    const [p] = await pool.execute(
      'SELECT id FROM projects WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [ch.author_id]
    );
    if (p.length) {
      await pool.execute('UPDATE changelogs SET project_id = ? WHERE id = ?', [p[0].id, ch.id]);
    }
  }

  // FK + NOT NULL project_id when safe
  const [[{ cnt }]] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM changelogs WHERE project_id IS NULL'
  );
  if (Number(cnt) === 0) {
    try {
      await pool.execute(`
        ALTER TABLE changelogs
        ADD CONSTRAINT fk_changelogs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      `);
    } catch (e) {
      if (!String(e.message).includes('Duplicate')) throw e;
    }
    try {
      await pool.execute('ALTER TABLE changelogs MODIFY COLUMN project_id INT NOT NULL');
    } catch (e) {
      /* ignore if already NOT NULL */
    }
  }

  // project_labels (custom labels per project)
  if (!(await tableExists(pool, 'project_labels'))) {
    await pool.execute(`
      CREATE TABLE project_labels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        slug VARCHAR(64) NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        color VARCHAR(32) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_project_slug (project_id, slug),
        CONSTRAINT fk_pl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // i18n translations
  if (!(await tableExists(pool, 'changelog_translations'))) {
    await pool.execute(`
      CREATE TABLE changelog_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        changelog_id INT NOT NULL,
        locale VARCHAR(16) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        UNIQUE KEY uk_changelog_locale (changelog_id, locale),
        CONSTRAINT fk_ct_changelog FOREIGN KEY (changelog_id) REFERENCES changelogs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Sync vote denormalized counts
  await pool.execute(`
    UPDATE changelogs c
    SET upvote_count = (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'upvote'),
        downvote_count = (SELECT COUNT(*) FROM votes v WHERE v.changelog_id = c.id AND v.vote_type = 'downvote')
  `);
}

module.exports = { migrateSchema, generatePublicKey, columnExists, tableExists };
