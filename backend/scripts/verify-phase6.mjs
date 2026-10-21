import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { ProfileService } from '../dist/modules/profile/application/profile.service.js';
import { PrismaService } from '../dist/platform/db/prisma.service.js';
import { TransactionRunner } from '../dist/platform/db/transaction-runner.js';
import { AppConfigService } from '../dist/platform/config/app-config.service.js';
import { SafetyProfileLoader } from '../dist/modules/safety/application/safety-profile.loader.js';
import { NotesCipher } from '../dist/modules/safety/infrastructure/notes-cipher.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
if (databaseUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not point at the application database.');
process.env.DATABASE_URL = databaseUrl;
process.env.ENABLE_OUTBOX_POLLER = 'false';
process.env.PROFILE_NOTES_KEYRING = JSON.stringify({ current: { kid: 'phase6-test', key: randomBytes(32).toString('base64url') } });

const pool = new pg.Pool({ connectionString: databaseUrl });
const userId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();
let prisma;
let roleCreated = false;
let userCreated = false;

try {
  console.log('phase6: verifying seeded references');
  const ref = (await pool.query(`SELECT
    (SELECT id FROM "Country" WHERE code = 'EG') AS country_id,
    (SELECT id FROM "Locale" WHERE code = 'en-US') AS locale_id,
    (SELECT id FROM "Language" WHERE code = 'en') AS language_id,
    (SELECT id FROM "Food" WHERE name = 'chicken egg') AS food_id,
    (SELECT id FROM "Food" WHERE name = 'tomato') AS second_food_id,
    (SELECT id FROM "HealthCondition" WHERE code = 'T2D') AS condition_id`)).rows[0];
  console.log('phase6: references loaded', Object.values(ref).every(Boolean));
  if (Object.values(ref).some((value) => !value)) throw new Error('Reference/safety seed is missing required rows.');
  await pool.query(`INSERT INTO "User" ("id", "email", "passwordHash", "name", "countryId", "localeId", "preferredLanguageId", "timezone") VALUES ($1, $2, 'integration-test', 'Phase Six Test', $3, $4, $5, 'Africa/Cairo'), ($6, $7, 'integration-test', 'Phase Six Other', $3, $4, $5, 'Africa/Cairo')`, [userId, `${userId}@phase6.invalid`, ref.country_id, ref.locale_id, ref.language_id, otherUserId, `${otherUserId}@phase6.invalid`]);
  userCreated = true;
  console.log('phase6: fixture users inserted');

  const config = new AppConfigService();
  prisma = new PrismaService(config);
  await prisma.$connect();
  const transactions = new TransactionRunner(prisma);
  const profile = new ProfileService(transactions, new NotesCipher(process.env.PROFILE_NOTES_KEYRING), new SafetyProfileLoader(transactions));
  await profile.updateProfile(userId, { heightCm: '177.5', weightKg: '72.25', birthDate: '1998-05-10', gender: 'FEMALE', activityLevel: 'MODERATE' });
  await profile.setGoal(userId, { goalType: 'LOSE_WEIGHT', targetWeightKg: '68.00', calorieTarget: 1900, proteinTargetG: 110 });
  await profile.setGoal(userId, { goalType: 'MAINTAIN', calorieTarget: 2100, proteinTargetG: 100 });
  const allergy = await profile.addAllergy(userId, { foodId: ref.food_id, severity: 'LIFE_THREATENING', notes: 'emergency note test' });
  await profile.setHealthConditions(userId, [{ healthConditionId: ref.condition_id, status: 'CONTROLLED', diagnosedAt: '2024-01-01', notes: 'condition note test' }]);
  await profile.setDietaryPreferences(userId, ['VEGETARIAN', 'GLUTEN_FREE']);
  console.log('phase6: profile mutations completed');

  const rawNotes = await pool.query(`SELECT "notes" FROM "UserAllergy" WHERE "userId" = $1`, [userId]);
  if (!rawNotes.rows[0].notes?.startsWith('enc:v1:') || rawNotes.rows[0].notes.includes('emergency note test')) throw new Error('Health note was not stored as authenticated ciphertext.');
  const loaded = await profile.myProfile(userId);
  if (loaded.allergies[0].notes !== 'emergency note test' || loaded.healthConditions[0].notes !== 'condition note test') throw new Error('Owner profile did not decrypt notes correctly.');
  const goalCount = await pool.query(`SELECT count(*)::int AS count FROM "UserGoal" WHERE "userId" = $1 AND "endedAt" IS NULL`, [userId]);
  if (goalCount.rows[0].count !== 1) throw new Error('Active goal uniqueness/history failed.');

  const foods = (await pool.query(`SELECT id FROM "Food" WHERE id <> $1 AND id <> $2 ORDER BY id LIMIT 10`, [ref.food_id, ref.second_food_id])).rows.map((row) => row.id);
  if (foods.length !== 10) throw new Error('Catalog seed requires at least ten foods for the statement trigger check.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    await db.query(`INSERT INTO "UserAllergy" ("id", "userId", "foodId", "severity") SELECT gen_random_uuid(), $1, food_id, 'MILD' FROM unnest($2::uuid[]) AS food_id`, [userId, foods]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
  const multiHistory = await pool.query(`SELECT count(*)::int AS count FROM "UserSafetyProfileEvent" WHERE "userId" = $1 AND "entityType" = 'ALLERGY_FOOD' AND "action" = 'CREATED'`, [userId]);
  if (multiHistory.rows[0].count !== 11) throw new Error('Statement-level trigger did not write one history row per allergy.');
  const changedOutbox = await pool.query(`SELECT count(*)::int AS count FROM "OutboxEvent" WHERE "topic" = 'safety.profile.changed' AND "payload"->>'userId' = $1 AND "processedAt" IS NULL AND "deadLetteredAt" IS NULL`, [userId]);
  console.log('phase6: statement trigger and outbox counts', changedOutbox.rows[0].count);
  if (changedOutbox.rows[0].count !== 4) throw new Error(`Expected one deduped outbox event per profile-change transaction; found ${changedOutbox.rows[0].count}.`);

  await pool.query(`DO $$ BEGIN CREATE ROLE phase6_rls_probe NOLOGIN NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  roleCreated = true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO phase6_rls_probe`);
  await pool.query(`GRANT SELECT ON "UserAllergy" TO phase6_rls_probe`);
  const rls = await pool.connect();
  try {
    await rls.query('SET ROLE phase6_rls_probe');
    await rls.query(`SELECT set_config('app.user_id', $1, false)`, [otherUserId]);
    const result = await rls.query(`SELECT count(*)::int AS count FROM "UserAllergy" WHERE "userId" = $1`, [userId]);
    if (result.rows[0].count !== 0) throw new Error('RLS leaked another user\'s allergy row.');
    await rls.query('RESET ROLE');
  } finally { rls.release(); }

  let appendOnlyRejected = false;
  try { await pool.query(`UPDATE "UserSafetyProfileEvent" SET "snapshot" = '{}'::jsonb WHERE "userId" = $1`, [userId]); }
  catch (error) { appendOnlyRejected = error.code === '42501'; }
  if (!appendOnlyRejected) throw new Error('Safety history accepted an UPDATE despite the append-only guard.');

  const history = await profile.mySafetyHistory(userId, 5);
  console.log('phase6: RLS and append-only checks completed');
  if (history.nodes.length !== 5 || !history.hasNextPage || history.nodes.some((event) => event.details.includes('notes'))) throw new Error('Safety history pagination/privacy failed.');
  console.log('Phase 6 integration passed: profile and goal history, encrypted notes, allergy/condition/diet mutations, 10-row statement trigger, outbox dedupe, append-only history, and owner-only RLS.');
} catch (error) {
  console.error('Phase 6 integration failed:', error);
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect();
  if (roleCreated) {
    await pool.query('REVOKE ALL ON SCHEMA public FROM phase6_rls_probe').catch(() => {});
    await pool.query('REVOKE ALL ON "UserAllergy" FROM phase6_rls_probe').catch(() => {});
    await pool.query('DROP ROLE IF EXISTS phase6_rls_probe').catch(() => {});
  }
  if (userCreated) {
    const tables = ['UserAllergy','UserAllergyCategory','UserHealthCondition','UserDietaryPreference','UserDislikedFood','UserDislikedCategory'];
    try {
      for (const table of tables) await pool.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`);
      await pool.query(`ALTER TABLE "UserSafetyProfileEvent" DISABLE TRIGGER ALL`);
      await pool.query(`DELETE FROM "UserSafetyProfileEvent" WHERE "userId" IN ($1, $2)`, [userId, otherUserId]);
      await pool.query(`DELETE FROM "OutboxEvent" WHERE "payload"->>'userId' IN ($1, $2)`, [userId, otherUserId]);
      for (const table of ['UserAllergy','UserAllergyCategory','UserHealthCondition','UserDietaryPreference','UserDislikedFood','UserDislikedCategory','UserProfile','UserGoal','UserWeightLog','UserPreference','UserPreferredCuisine','UserFoodPreference']) {
        await pool.query(`DELETE FROM "${table}" WHERE "userId" IN ($1, $2)`, [userId, otherUserId]);
      }
      await pool.query(`DELETE FROM "User" WHERE "id" IN ($1, $2)`, [userId, otherUserId]);
    } finally {
      await pool.query(`ALTER TABLE "UserSafetyProfileEvent" ENABLE TRIGGER ALL`).catch(() => {});
      for (const table of tables) await pool.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`).catch(() => {});
    }
  }
  await pool.end();
}
