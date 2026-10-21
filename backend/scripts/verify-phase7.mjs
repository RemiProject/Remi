import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../dist/app.module.js';
import { AppConfigService } from '../dist/platform/config/app-config.service.js';
import { InventoryLedgerService } from '../dist/modules/inventory/application/inventory-ledger.service.js';
import { PredictionService } from '../dist/modules/predictions/application/prediction.service.js';
import { convertQuantity } from '../dist/modules/units/domain/unit-converter.js';
import { evaluateFreshness } from '../dist/modules/predictions/domain/freshness-policy.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
if (databaseUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not point at the application database.');
process.env.DATABASE_URL = databaseUrl;
process.env.ENABLE_OUTBOX_POLLER = 'false';

const pool = new pg.Pool({ connectionString: databaseUrl });
const householdId = uuidv7();
const userId = uuidv7();
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
if (app.get(AppConfigService).env.ENABLE_OUTBOX_POLLER) throw new Error('Outbox poller must be disabled for deterministic integration assertions.');
const ledger = app.get(InventoryLedgerService);
const predictions = app.get(PredictionService);
let inventoryItemId;
let imageId;

try {
  const ref = (await pool.query(`SELECT (SELECT id FROM "Country" WHERE code = 'EG') AS country_id,
    (SELECT id FROM "Locale" WHERE code = 'en-US') AS locale_id,
    (SELECT id FROM "Language" WHERE code = 'en') AS language_id,
    (SELECT id FROM "Food" WHERE name = 'tomato') AS food_id`)).rows[0];
  if (Object.values(ref).some((value) => !value)) throw new Error('Reference seed is missing Country, Locale, Language or tomato Food.');
  await pool.query(`INSERT INTO "User" ("id", "email", "passwordHash", "name", "countryId", "localeId", "preferredLanguageId", "timezone") VALUES ($1, $2, 'integration-test', 'Phase Seven Test', $3, $4, $5, 'Africa/Cairo')`, [userId, `${userId}@phase7.invalid`, ref.country_id, ref.locale_id, ref.language_id]);
  await pool.query(`INSERT INTO "Household" ("id", "name", "timezone") VALUES ($1, 'Phase Seven Integration', 'Africa/Cairo')`, [householdId]);
  await pool.query(`INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role") VALUES ($1, $2, $3, 'OWNER')`, [uuidv7(), householdId, userId]);

  const stock = await ledger.addStock(householdId, userId, { foodId: ref.food_id, amount: '300', unit: 'GRAM', idempotencyKey: `phase7-stock-${householdId}` });
  inventoryItemId = stock.balances[0].inventoryItemId;
  await ledger.consumeStock(householdId, userId, { foodId: ref.food_id, amount: '100', unit: 'GRAM', idempotencyKey: `phase7-use-1-${householdId}` });
  const queued = (await pool.query(`SELECT "nextAttemptAt", "createdAt" FROM "OutboxEvent" WHERE "topic" = 'prediction.food_depletion.requested' AND "householdId" = $1 AND "dedupeKey" = $2 AND "processedAt" IS NULL ORDER BY "id" DESC LIMIT 1`, [householdId, `${householdId}:FOOD_DEPLETION`])).rows[0];
  if (!queued || new Date(queued.nextAttemptAt).getTime() - new Date(queued.createdAt).getTime() < 4 * 60 * 1000) throw new Error('Inventory changes did not debounce the prediction event for five minutes.');

  await Promise.all([predictions.generateFoodDepletion(householdId), predictions.generateFoodDepletion(householdId)]);
  const first = (await pool.query(`SELECT p."id", p."inputHash", d."currentQty"::text AS qty, d."avgDailyQty"::text AS average, d."daysLeft"::text AS days_left FROM "AIPrediction" p JOIN "AIFoodDepletionPrediction" d ON d."predictionId" = p."id" WHERE p."householdId" = $1 AND d."foodId" = $2 AND p."expiresAt" > now()`, [householdId, ref.food_id])).rows;
  const firstStockRow = (await pool.query(`SELECT i.quantity::text, i.unit::text AS unit, f."defaultUnit"::text AS "defaultUnit", f."densityGPerMl"::text AS "densityGPerMl", f."gramsPerPiece"::text AS "gramsPerPiece" FROM "InventoryItem" i JOIN "Food" f ON f.id=i."foodId" WHERE i."id" = $1 AND i."householdId" = $2`, [inventoryItemId, householdId])).rows[0];
  const firstNormalized = convertQuantity(firstStockRow.quantity, firstStockRow.unit, firstStockRow.defaultUnit, firstStockRow);
  if (first.length !== 1 || first[0].qty !== firstNormalized || Number(first[0].average) <= 0 || Number(first[0].days_left) <= 0) throw new Error(`Idempotent depletion prediction failed: ${JSON.stringify(first)}`);

  await ledger.consumeStock(householdId, userId, { foodId: ref.food_id, amount: '30', unit: 'GRAM', idempotencyKey: `phase7-use-2-${householdId}` });
  await Promise.all([predictions.generateFoodDepletion(householdId), predictions.generateFoodDepletion(householdId)]);
  const afterChange = (await pool.query(`SELECT p."inputHash", p."expiresAt" > now() AS active, d."currentQty"::text AS qty FROM "AIPrediction" p JOIN "AIFoodDepletionPrediction" d ON d."predictionId" = p."id" WHERE p."householdId" = $1 AND d."foodId" = $2 ORDER BY p."generatedAt"`, [householdId, ref.food_id])).rows;
  const currentStockRow = (await pool.query(`SELECT i.quantity::text, i.version, i.unit::text AS unit, f."defaultUnit"::text AS "defaultUnit", f."densityGPerMl"::text AS "densityGPerMl", f."gramsPerPiece"::text AS "gramsPerPiece" FROM "InventoryItem" i JOIN "Food" f ON f.id=i."foodId" WHERE i."id" = $1 AND i."householdId" = $2`, [inventoryItemId, householdId])).rows[0];
  const currentNormalized = convertQuantity(currentStockRow.quantity, currentStockRow.unit, currentStockRow.defaultUnit, currentStockRow);
  if (afterChange.length !== 2 || afterChange.filter((row) => row.active).length !== 1 || afterChange.find((row) => row.active).qty !== currentNormalized) throw new Error(`Changed input did not supersede the old prediction: ${JSON.stringify(afterChange)}`);

  imageId = uuidv7();
  await pool.query(`INSERT INTO "Image" ("id", "householdId", "uploadedByUserId", "type", "storageKey", "mimeType", "sizeBytes") VALUES ($1,$2,$3,'FRESHNESS',$4,'image/jpeg',1024)`, [imageId, householdId, userId, `${householdId}/phase7-freshness.jpg`]);
  await pool.query(`INSERT INTO "FreshnessPrediction" ("id", "inventoryItemId", "householdId", "imageId", "qualityScore", "confidence", "remainingQualityHours") VALUES ($1,$2,$3,$4,0.820,0.910,36)`, [uuidv7(), inventoryItemId, householdId, imageId]);
  await predictions.recomputeFreshness(householdId, inventoryItemId);
  const freshness = (await pool.query(`SELECT "freshnessScore"::text AS score, quantity::text, version FROM "InventoryItem" WHERE id = $1 AND "householdId" = $2`, [inventoryItemId, householdId])).rows[0];
  if (freshness.score !== '0.820' || freshness.quantity !== currentStockRow.quantity || freshness.version !== currentStockRow.version) throw new Error(`Freshness cache changed inventory facts or computed an incorrect score: ${JSON.stringify(freshness)}`);
  await pool.query(`UPDATE "FreshnessPrediction" SET "predictedAt" = now() - interval '48 hours', "remainingQualityHours" = 1 WHERE "inventoryItemId" = $1 AND "householdId" = $2`, [inventoryItemId, householdId]);
  const aged = (await pool.query(`SELECT "confidence"::text, "predictedAt", "remainingQualityHours", "predictedAt" + make_interval(hours => "remainingQualityHours") <= now() AS is_expired FROM "FreshnessPrediction" WHERE "inventoryItemId" = $1 AND "householdId" = $2`, [inventoryItemId, householdId])).rows;
  const policyResult = evaluateFreshness(aged.map((sample) => ({ id: 'sample', confidence: Number(sample.confidence), predictedAt: new Date(sample.predictedAt), remainingQualityHours: sample.remainingQualityHours, qualityScore: 0.82 })), new Date());
  await predictions.recomputeFreshness(householdId, inventoryItemId);
  const expired = (await pool.query(`SELECT "freshnessScore"::text AS score, quantity::text, version FROM "InventoryItem" WHERE id = $1 AND "householdId" = $2`, [inventoryItemId, householdId])).rows[0];
  if (expired.score !== null || expired.quantity !== currentStockRow.quantity || expired.version !== currentStockRow.version) throw new Error(`Expired freshness sample was not cleared safely: ${JSON.stringify({ expired, aged, policyResult })}`);

  const forecastOutbox = (await pool.query(`SELECT count(*)::int AS count FROM "OutboxEvent" WHERE "topic" = 'prediction.food_depletion.requested' AND "householdId" = $1`, [householdId])).rows[0].count;
  if (forecastOutbox !== 1) throw new Error(`Expected one debounced outbox row; found ${forecastOutbox}.`);
  console.log('Phase 7 integration passed: five-minute outbox debounce, deterministic depletion, idempotent hash, changed-input supersede, freshness policy/cache, and inventory quantity/version isolation.');
} finally {
  try {
    await pool.query(`DELETE FROM "AIPrediction" WHERE "householdId" = $1`, [householdId]);
    await pool.query(`DELETE FROM "FreshnessPrediction" WHERE "householdId" = $1`, [householdId]);
    if (imageId) await pool.query(`DELETE FROM "Image" WHERE "id" = $1`, [imageId]);
    if (inventoryItemId) {
      await pool.query('ALTER TABLE "InventoryTransaction" DISABLE TRIGGER "InventoryTransaction_append_only"');
      await pool.query(`DELETE FROM "InventoryTransaction" WHERE "householdId" = $1`, [householdId]);
      await pool.query(`DELETE FROM "FoodEvent" WHERE "householdId" = $1`, [householdId]);
      await pool.query(`DELETE FROM "InventoryItem" WHERE "householdId" = $1`, [householdId]);
      await pool.query('ALTER TABLE "InventoryTransaction" ENABLE TRIGGER "InventoryTransaction_append_only"');
    }
    await pool.query(`DELETE FROM "OutboxEvent" WHERE "householdId" = $1 AND "topic" LIKE 'prediction.%'`, [householdId]);
    await pool.query(`DELETE FROM "HouseholdMember" WHERE "householdId" = $1`, [householdId]);
    await pool.query(`DELETE FROM "Household" WHERE "id" = $1`, [householdId]);
    await pool.query(`DELETE FROM "User" WHERE "id" = $1`, [userId]);
  } finally {
    await app.close();
    await pool.end();
  }
}
