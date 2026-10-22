import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { v7 as uuidv7 } from 'uuid';

const url = process.env.PHASE11_PROBE_URL ?? process.env.DATABASE_URL_TEST;
if (!url) throw new Error('Set DATABASE_URL_TEST to the dedicated test database.');
if (url === process.env.DATABASE_URL && process.env.PHASE11_ALLOW_APP_DB_PROBE !== 'true') {
  throw new Error('Refusing to probe the application database unless PHASE11_ALLOW_APP_DB_PROBE=true.');
}

const client = new pg.Client({ connectionString: url });
const probeRole = `kitchen_probe_${randomBytes(6).toString('hex')}`;
const probePassword = randomBytes(32).toString('base64url');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let probeCreated = false;
let runtimeClient;
try {
  await client.connect();
  await client.query(`CREATE ROLE ${probeRole} LOGIN PASSWORD '${probePassword}' IN ROLE kitchen_runtime`);
  probeCreated = true;
  const runtimeUrl = new URL(url);
  runtimeUrl.username = probeRole;
  runtimeUrl.password = probePassword;
  runtimeClient = new pg.Client({ connectionString: runtimeUrl.toString() });
  await runtimeClient.connect();
  const role = (await runtimeClient.query(`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls
    FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
  const access = (await runtimeClient.query(`SELECT
      has_table_privilege(current_user, 'public."AIRecommendation"', 'SELECT') AS can_read_recommendations,
      has_function_privilege(current_user, 'recommendation_safety_owner(uuid,uuid)', 'EXECUTE') AS safety_owner,
      has_function_privilege(current_user, 'recommendation_expire_batch(integer)', 'EXECUTE') AS expire_batch,
      has_function_privilege(current_user, 'notification_delivery_claim(integer)', 'EXECUTE') AS notification_worker,
      has_function_privilege(current_user, 'search_document_claim(text)', 'EXECUTE') AS search_worker`)).rows[0];
  const visible = (await runtimeClient.query(`SELECT
      (SELECT count(*)::int FROM public."AIRecommendation") AS recommendations,
      (SELECT count(*)::int FROM public."AIShoppingRecommendation") AS shopping,
      (SELECT count(*)::int FROM public."AIRecommendationSafetyCheck") AS safety_checks`)).rows[0];

  console.log(JSON.stringify({ role, access, visibleWithoutTenantContext: visible }, null, 2));
  if (role.superuser || role.bypass_rls) throw new Error('Runtime group is unexpectedly privileged.');
  if (Object.values(access).some((granted) => !granted)) throw new Error('Runtime group is missing a required table or worker-function grant.');
  if (Object.values(visible).some((count) => count !== 0)) throw new Error('RLS exposed recommendation rows without tenant context.');
  if (url !== process.env.DATABASE_URL) await verifyRecommendationIsolation(client, runtimeClient);
  process.env.DATABASE_URL = runtimeUrl.toString();
  await import('./audit-phase11.mjs');
  if (process.env.PHASE11_RUNTIME_API_SMOKE === 'true') await smokeApi(runtimeUrl.toString());
  console.log('PASS: least-privilege role and unscoped recommendation visibility checks passed.');
} catch (error) {
  throw error;
} finally {
  await runtimeClient?.end().catch(() => undefined);
  if (probeCreated) await client.query(`DROP ROLE IF EXISTS ${probeRole}`).catch(() => undefined);
  await client.end();
}

async function verifyRecommendationIsolation(admin, runtime) {
  const users = [uuidv7(), uuidv7()];
  const householdId = uuidv7();
  const recommendationIds = [uuidv7(), uuidv7()];
  const memberIds = [uuidv7(), uuidv7()];
  let created = false;
  try {
    const refs = (await admin.query(`SELECT
        (SELECT id FROM public."Country" WHERE code = 'EG' LIMIT 1) AS country,
        (SELECT id FROM public."Locale" WHERE code = 'en-US' LIMIT 1) AS locale,
        (SELECT id FROM public."Language" WHERE code = 'en' LIMIT 1) AS language,
        (SELECT id FROM public."Food" LIMIT 1) AS food`)).rows[0];
    if (Object.values(refs).some((value) => !value)) throw new Error('The isolated test database needs reference rows and at least one Food row.');

    await admin.query('BEGIN');
    for (const [index, userId] of users.entries()) {
      await admin.query(`INSERT INTO public."User" (id,email,"passwordHash",name,"countryId","localeId","preferredLanguageId",timezone)
        VALUES ($1,$2,'phase11-rls-test','Phase 11 RLS Probe',$3,$4,$5,'Africa/Cairo')`, [userId, `${userId}@phase11.invalid`, refs.country, refs.locale, refs.language]);
    }
    await admin.query(`INSERT INTO public."Household" (id,name,timezone) VALUES ($1,'Phase 11 RLS Probe','Africa/Cairo')`, [householdId]);
    for (const [index, userId] of users.entries()) {
      await admin.query(`INSERT INTO public."HouseholdMember" (id,"householdId","userId",role) VALUES ($1,$2,$3,$4)`, [memberIds[index], householdId, userId, index === 0 ? 'OWNER' : 'MEMBER']);
      await admin.query(`INSERT INTO public."AIRecommendation" (id,"householdId","userId",type,status,"safetyStatus","modelVersion","inputHash","expiresAt")
        VALUES ($1,$2,$3,'SUPPLY_NEED','DRAFT','PENDING','phase11-rls-test',$4,now()+interval '1 day')`, [recommendationIds[index], householdId, userId, (index + 1).toString(16).padStart(64, '0')]);
      await admin.query(`INSERT INTO public."AIShoppingRecommendation" ("recommendationId","householdId","recommendationType","foodId","suggestedQty",unit,priority)
        VALUES ($1,$2,'SUPPLY_NEED',$3,1,'GRAM','NORMAL')`, [recommendationIds[index], householdId, refs.food]);
      await admin.query(`INSERT INTO public."AIRecommendationSafetyCheck" (id,"recommendationId","filterType",result)
        VALUES ($1,$2,'ALLERGY_FOOD','WARNED')`, [uuidv7(), recommendationIds[index]]);
    }
    await admin.query('COMMIT');
    created = true;

    await runtime.query('BEGIN');
    for (const [index, userId] of users.entries()) {
      await runtime.query(`SELECT set_config('app.household_id',$1,true), set_config('app.user_id',$2,true)`, [householdId, userId]);
      const rows = (await runtime.query(`SELECT
          (SELECT count(*)::int FROM public."AIRecommendation") AS recommendations,
          (SELECT count(*)::int FROM public."AIShoppingRecommendation") AS shopping,
          (SELECT count(*)::int FROM public."AIRecommendationSafetyCheck") AS safety_checks,
          (SELECT count(*)::int FROM public."AIRecommendation" WHERE id=$1) AS own_row,
          (SELECT count(*)::int FROM public."AIRecommendation" WHERE id=$2) AS other_user_row`, [recommendationIds[index], recommendationIds[1 - index]])).rows[0];
      if (rows.recommendations !== 1 || rows.shopping !== 1 || rows.safety_checks !== 1 || rows.own_row !== 1 || rows.other_user_row !== 0) {
        throw new Error('Recommendation RLS did not isolate the test users within one household.');
      }
    }
    await runtime.query('ROLLBACK');
    console.log('PASS: recommendation, shopping, and safety-check rows are isolated between household members.');
  } finally {
    if (!created) await admin.query('ROLLBACK').catch(() => undefined);
    else {
      await admin.query('BEGIN');
      await admin.query(`DELETE FROM public."OutboxEvent" WHERE topic='safety.profile.changed' AND payload->>'userId' = ANY($1::text[])`, [users]);
      await admin.query(`DELETE FROM public."AIRecommendationSafetyCheck" WHERE "recommendationId" = ANY($1::uuid[])`, [recommendationIds]);
      await admin.query(`DELETE FROM public."AIShoppingRecommendation" WHERE "recommendationId" = ANY($1::uuid[])`, [recommendationIds]);
      await admin.query(`DELETE FROM public."AIRecommendation" WHERE id = ANY($1::uuid[])`, [recommendationIds]);
      await admin.query(`DELETE FROM public."HouseholdMember" WHERE id = ANY($1::uuid[])`, [memberIds]);
      await admin.query(`DELETE FROM public."Household" WHERE id=$1`, [householdId]);
      await admin.query(`DELETE FROM public."User" WHERE id = ANY($1::uuid[])`, [users]);
      await admin.query('COMMIT');
    }
  }
}

async function smokeApi(connectionString) {
  const port = 3101 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', '-e', 'await import("./dist/main.js")'], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: connectionString, NODE_ENV: 'development', PORT: String(port), ENABLE_OUTBOX_POLLER: 'false' },
  });
  try {
    let ready;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`API exited before readiness (exit=${child.exitCode}).`);
      try {
        ready = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(1000) });
        if (ready.ok) break;
      } catch { /* API is still starting. */ }
      await delay(300);
    }
    if (!ready?.ok) throw new Error('API did not become ready with the temporary non-superuser role.');
    const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ countries { id code name } }' }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length || !Array.isArray(payload.data?.countries)) {
      throw new Error('Read-only GraphQL smoke query failed with the temporary non-superuser role.');
    }
    console.log(JSON.stringify({ runtimeApiReady: ready.status, graphQLStatus: response.status, countriesReturned: payload.data.countries.length }));
  } finally {
    child.kill();
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), delay(3000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
