import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';

if (process.env.PHASE11_PROVISION_RUNTIME !== 'true') {
  throw new Error('Set PHASE11_PROVISION_RUNTIME=true to explicitly provision the local API runtime role.');
}
const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_URL_MIGRATOR || runtimeUrl;
if (!runtimeUrl || !migrationUrl) throw new Error('DATABASE_URL and a migration connection are required.');

const envPath = new URL('../.env', import.meta.url);
const envSource = await readFile(envPath, 'utf8');
const roleName = `kitchen_api_${randomBytes(6).toString('hex')}`;
const password = randomBytes(32).toString('base64url');
const client = new pg.Client({ connectionString: migrationUrl });
let roleCreated = false;
try {
  await client.connect();
  const group = (await client.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='kitchen_runtime'`)).rows[0];
  if (!group || group.rolsuper || group.rolbypassrls) throw new Error('kitchen_runtime group is missing or has unsafe role attributes.');
  await client.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' IN ROLE kitchen_runtime`);
  roleCreated = true;

  const newRuntimeUrl = new URL(runtimeUrl);
  newRuntimeUrl.username = roleName;
  newRuntimeUrl.password = password;
  const updates = new Map([
    ['DATABASE_URL', newRuntimeUrl.toString()],
    ['DATABASE_URL_MIGRATOR', migrationUrl],
  ]);
  const seen = new Set();
  const lines = envSource.split(/\r?\n/).map((line) => {
    const key = line.split('=', 1)[0];
    if (!updates.has(key)) return line;
    seen.add(key);
    return `${key}=${updates.get(key)}`;
  });
  for (const [key, value] of updates) if (!seen.has(key)) lines.push(`${key}=${value}`);
  const temporaryPath = new URL('../.env.phase11.tmp', import.meta.url);
  await writeFile(temporaryPath, lines.join('\r\n'), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, envPath);
  console.log(JSON.stringify({ provisionedRole: roleName, runtimeRoleInstalledInLocalEnv: true, migratorSeparated: true }));
} catch (error) {
  if (roleCreated) await client.query(`DROP ROLE IF EXISTS ${roleName}`).catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
