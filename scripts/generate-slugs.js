const mysql = require('mysql2/promise');

function slugify(str) {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root', // <-- update if needed
    database: 'release_log_db', // <-- update if needed
  });

  const [rows] = await connection.execute('SELECT id, title FROM changelogs');
  const usedSlugs = new Set();

  for (const row of rows) {
    let baseSlug = slugify(row.title);
    let slug = baseSlug;
    let i = 1;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${i++}`;
    }
    usedSlugs.add(slug);
    await connection.execute('UPDATE changelogs SET slug = ? WHERE id = ?', [slug, row.id]);
    console.log(`Updated changelog ${row.id} with slug: ${slug}`);
  }

  await connection.end();
  console.log('All slugs generated and updated.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 