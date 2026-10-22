import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
if (databaseUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not point at the application database.');

// Upgrade only the explicitly separate test database and ensure reference rows exist.
process.env.DATABASE_URL = databaseUrl;
process.env.DATABASE_URL_MIGRATOR = '';
await import('./migrate.mjs');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const userId = uuidv7();
const householdId = uuidv7();
const memberId = uuidv7();
const notificationId = uuidv7();
const deliveryId = uuidv7();
const deviceId = uuidv7();
const preferenceNotificationId = uuidv7();
const preferenceDeliveryId = uuidv7();
const expiryFoodId = uuidv7();
const expiryInventoryItemId = uuidv7();
const duplicateKey = `phase10-dedupe-${uuidv7()}`;
const workerA = await pool.connect();
const workerB = await pool.connect();

try {
  for (const [code, name] of [['EG', 'Egypt'], ['US', 'United States']]) await pool.query(`INSERT INTO "Country" (id,code,name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [uuidv7(), code, name]);
  for (const [code, name, isRtl] of [['ar', 'Arabic', true], ['en', 'English', false]]) await pool.query(`INSERT INTO "Language" (id,code,name,"isRtl") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [uuidv7(), code, name, isRtl]);
  for (const [code, name, language] of [['ar-EG', 'Arabic (Egypt)', 'ar'], ['en-US', 'English (United States)', 'en']]) {
    await pool.query(`INSERT INTO "Locale" (id,code,name,"languageId") SELECT $1,$2,$3,id FROM "Language" WHERE code=$4 ON CONFLICT DO NOTHING`, [uuidv7(), code, name, language]);
  }
  await pool.query(`INSERT INTO "FoodCategory" (id,code,name) VALUES ($1,'VEGETABLES','Vegetables') ON CONFLICT DO NOTHING`, [uuidv7()]);
  const refs = (await pool.query(`SELECT (SELECT id FROM "Country" WHERE code='EG') country_id,
    (SELECT id FROM "Locale" WHERE code='en-US') locale_id, (SELECT id FROM "Language" WHERE code='en') language_id`)).rows[0];
  if (Object.values(refs).some((value) => !value)) throw new Error('Reference seed is missing Country, Locale or Language.');
  await pool.query(`INSERT INTO "User" (id,email,"passwordHash",name,"countryId","localeId","preferredLanguageId",timezone)
    VALUES ($1,$2,'phase10-test','Phase 10 Test',$3,$4,$5,'Africa/Cairo')`, [userId, `${userId}@phase10.invalid`, refs.country_id, refs.locale_id, refs.language_id]);
  await pool.query(`INSERT INTO "Household" (id,name,timezone) VALUES ($1,'Phase Ten Integration','Africa/Cairo')`, [householdId]);
  await pool.query(`INSERT INTO "HouseholdMember" (id,"householdId","userId",role) VALUES ($1,$2,$3,'OWNER')`, [memberId, householdId, userId]);
  const categoryId = (await pool.query(`SELECT id FROM "FoodCategory" WHERE code='VEGETABLES'`)).rows[0]?.id;
  if (!categoryId) throw new Error('Reference seed is missing the vegetables food category.');
  await pool.query(`INSERT INTO "Food" (id,"categoryId",name,"defaultUnit") VALUES ($1,$2,$3,'GRAM')`, [expiryFoodId, categoryId, `phase10 expiry ${uuidv7()}`]);
  await pool.query(`INSERT INTO "InventoryItem" (id,"householdId","foodId",quantity,unit,"estimatedExpiryAt") VALUES ($1,$2,$3,100,'GRAM',now()+interval '1 day')`, [expiryInventoryItemId, householdId, expiryFoodId]);

  await pool.query('SELECT notification_expiry_generate(500)');
  await pool.query('SELECT notification_expiry_generate(500)');
  const expiry = (await pool.query(`SELECT count(*)::int AS count FROM "Notification" WHERE "inventoryItemId"=$1`, [expiryInventoryItemId])).rows[0].count;
  if (expiry !== 1) throw new Error(`Expiry notification should be generated once across two sweeps; found ${expiry}.`);
  console.log('PASS two expiry sweeps create one alert per item and expiry date.');
  await pool.query(`INSERT INTO "UserDevice" (id,"userId",platform,"pushToken") VALUES ($1,$2,'ANDROID',$3)`, [deviceId, userId, `phase10-token-${uuidv7()}`]);

  const insertNotification = (id, dedupeKey) => pool.query(`INSERT INTO "Notification" (id,"householdId","userId",type,"dedupeKey")
    VALUES ($1,$2,$3,'MEMBER_CHANGED',$4) ON CONFLICT ("userId","dedupeKey") DO NOTHING RETURNING id`, [id, householdId, userId, dedupeKey]);
  const first = await insertNotification(notificationId, duplicateKey);
  const duplicate = await insertNotification(uuidv7(), duplicateKey);
  if (first.rowCount !== 1 || duplicate.rowCount !== 0) throw new Error('Duplicate user notification was inserted.');
  console.log('PASS notification dedupe key allows one inbox row.');

  await pool.query(`INSERT INTO "NotificationDelivery" (id,"notificationId","userId","deviceId",channel) VALUES ($1,$2,$3,$4,'PUSH')`, [deliveryId, notificationId, userId, deviceId]);
  await workerA.query('BEGIN');
  const claimedA = await workerA.query('SELECT * FROM notification_delivery_claim(1)');
  if (claimedA.rowCount !== 1 || claimedA.rows[0].id !== deliveryId) throw new Error('First worker failed to claim the pending push.');
  const claimedB = await workerB.query('SELECT * FROM notification_delivery_claim(1)');
  if (claimedB.rows.some((row) => row.id === deliveryId)) throw new Error('Two workers claimed the same notification delivery.');
  await workerA.query('COMMIT');
  const afterCommit = await workerB.query('SELECT * FROM notification_delivery_claim(1)');
  if (afterCommit.rows.some((row) => row.id === deliveryId)) throw new Error('A PROCESSING delivery was claimed a second time.');
  console.log('PASS concurrent workers never claim the same delivery.');

  await pool.query('SELECT notification_device_unregistered($1::uuid,$2::uuid)', [deliveryId, deviceId]);
  const revoked = (await pool.query(`SELECT d.status::text status, u."revokedAt" FROM "NotificationDelivery" d
    JOIN "UserDevice" u ON u.id=d."deviceId" WHERE d.id=$1`, [deliveryId])).rows[0];
  if (revoked.status !== 'FAILED' || !revoked.revokedAt) throw new Error('Unregistered provider token did not revoke its device and fail its delivery.');
  console.log('PASS unregistered push token revokes its device.');

  await pool.query(`INSERT INTO "NotificationPreference" ("userId",type,channel,"isEnabled") VALUES ($1,'MEMBER_CHANGED','EMAIL',false)`, [userId]);
  await insertNotification(preferenceNotificationId, `phase10-pref-${uuidv7()}`);
  await pool.query(`INSERT INTO "NotificationDelivery" (id,"notificationId","userId",channel) VALUES ($1,$2,$3,'EMAIL')`, [preferenceDeliveryId, preferenceNotificationId, userId]);
  const disabledClaim = await pool.query('SELECT * FROM notification_delivery_claim(10)');
  if (disabledClaim.rows.some((row) => row.id === preferenceDeliveryId)) throw new Error('Delivery was claimed despite the channel preference being disabled.');
  const disabled = (await pool.query(`SELECT status::text status,"failureCode" FROM "NotificationDelivery" WHERE id=$1`, [preferenceDeliveryId])).rows[0];
  if (disabled.status !== 'FAILED' || disabled.failureCode !== 'preference_disabled') throw new Error('Disabled preference did not suppress delivery.');
  console.log('PASS disabled channel preference suppresses delivery.');
} finally {
  try { await workerA.query('ROLLBACK'); } catch {}
  await pool.query(`DELETE FROM "HouseholdMember" WHERE "householdId"=$1`, [householdId]);
  await pool.query(`DELETE FROM "InventoryItem" WHERE id=$1`, [expiryInventoryItemId]);
  await pool.query(`DELETE FROM "Food" WHERE id=$1`, [expiryFoodId]);
  await pool.query(`DELETE FROM "Household" WHERE id=$1`, [householdId]);
  await pool.query(`DELETE FROM "User" WHERE id=$1`, [userId]);
  workerA.release();
  workerB.release();
  await pool.end();
}
