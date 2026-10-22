import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const sourceUrl = process.env.DATABASE_URL_TEST;
if (!sourceUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL database.');
if (sourceUrl === process.env.DATABASE_URL) throw new Error('Refusing to dump or restore from the application database; DATABASE_URL_TEST must be separate.');

const source = new URL(sourceUrl);
const env = { ...process.env };
if (source.password) env.PGPASSWORD = decodeURIComponent(source.password);
if (source.searchParams.has('sslmode')) env.PGSSLMODE = source.searchParams.get('sslmode');
const sourceArg = new URL(sourceUrl);
sourceArg.password = '';
const databaseName = `phase11_restore_${randomBytes(6).toString('hex')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${databaseName}`;
const scratchArg = new URL(scratchUrl);
scratchArg.password = '';
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const dir = await mkdtemp(join(tmpdir(), 'ai-kitchen-phase11-'));
const backupPath = join(dir, 'phase11.backup');

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const admin = new pg.Client({ connectionString: adminUrl.toString() });
let created = false;
try {
  await admin.connect();
  const sourceClient = new pg.Client({ connectionString: sourceUrl });
  await sourceClient.connect();
  const expected = (await sourceClient.query(`SELECT count(*)::int AS migrations FROM "_migrations"`)).rows[0].migrations;
  await sourceClient.end();
  if (expected < 1) throw new Error('Source database has no migration ledger to verify.');
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', backupPath, '--dbname', sourceArg.toString()]);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await run('pg_restore', ['--no-owner', '--no-privileges', '--dbname', scratchArg.toString(), backupPath]);
  const restored = new pg.Client({ connectionString: scratchUrl.toString() });
  await restored.connect();
  const result = await restored.query(`SELECT count(*)::int AS migrations FROM "_migrations"`);
  await restored.end();
  if (result.rows[0].migrations !== expected) throw new Error(`Restore verification found ${result.rows[0].migrations} migrations; source has ${expected}.`);
  console.log(`PASS backup restored and verified all ${result.rows[0].migrations} migrations in ${databaseName}.`);
} finally {
  if (created) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
  await rm(dir, { recursive: true, force: true });
}
