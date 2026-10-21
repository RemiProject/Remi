// Applies prisma/migrations/*.sql in order, each in its own transaction, with checksum verification.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS "_migrations" (
    name text PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now())`);
  const applied = new Map((await client.query('SELECT name, checksum FROM "_migrations"')).rows.map((r) => [r.name, r.checksum]));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(file)) {
  if (applied.get(file) !== checksum) {
    throw new Error(
      `Checksum mismatch for already-applied migration ${file}`
    );
  }

  console.log(`skipping ${file} (already applied)`);
  continue;
}
    console.log(`applying ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO "_migrations" (name, checksum) VALUES ($1, $2)', [file, checksum]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  console.log('migrations up to date');
} finally {
  await client.end();
}
