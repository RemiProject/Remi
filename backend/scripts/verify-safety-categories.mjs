// Integration check for migration 0027 on the disposable test database:
// FoodCategoryMembership + ProductSafetyTag in the safety gate, the catalog fail-closed trigger,
// recommendation reasons, and productSafetyCheck. Run: pnpm build && node --env-file=.env scripts/verify-safety-categories.mjs
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../dist/app.module.js';
import { InventoryLedgerService } from '../dist/modules/inventory/application/inventory-ledger.service.js';
import { PredictionService } from '../dist/modules/predictions/application/prediction.service.js';
import { RecommendationService } from '../dist/modules/recommendations/application/recommendation.service.js';
import { ProductSafetyService } from '../dist/modules/safety/application/product-safety.service.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
if (databaseUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not point at the application database.');
process.env.DATABASE_URL = databaseUrl;
process.env.ENABLE_OUTBOX_POLLER = 'false';

const pool = new pg.Pool({ connectionString: databaseUrl });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const assert = (ok, message, detail) => { if (!ok) throw new Error(`${message}: ${JSON.stringify(detail)}`); console.log(`  ✓ ${message}`); };
const householdId = uuidv7(), userId = uuidv7(), productId = uuidv7(), barcode = `TEST-${householdId}`;
const breadId = uuidv7(); // a dedicated GRAINS food, so real catalog memberships (data/food-safety-categories.csv) can't interfere
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
const ledger = app.get(InventoryLedgerService), predictions = app.get(PredictionService);
const recommendations = app.get(RecommendationService), productSafety = app.get(ProductSafetyService);
let membershipId;

try {
  const ref = (await q(`SELECT (SELECT id FROM "Country" WHERE code = 'EG') AS country, (SELECT id FROM "Locale" WHERE code = 'en-US') AS locale,
    (SELECT id FROM "Language" WHERE code = 'en') AS language, (SELECT id FROM "FoodCategory" WHERE code = 'GRAINS') AS grains,
    (SELECT id FROM "Food" WHERE name = 'tomato') AS tomato, (SELECT id FROM "FoodCategory" WHERE code = 'GLUTEN') AS gluten,
    (SELECT id FROM "FoodCategory" WHERE code = 'TREE_NUTS') AS nuts`))[0];
  if (Object.values(ref).some((value) => !value)) throw new Error(`Reference/catalog seed is incomplete: ${JSON.stringify(ref)}`);
  await q(`INSERT INTO "Food" (id, "categoryId", name, "defaultUnit") VALUES ($1, $2, $3, 'GRAM')`, [breadId, ref.grains, `zz safety bread ${breadId}`]);
  ref.bread = breadId;

  await q(`INSERT INTO "User" (id, email, "passwordHash", name, "countryId", "localeId", "preferredLanguageId", timezone) VALUES ($1, $2, 'integration-test', 'Safety Categories Test', $3, $4, $5, 'Africa/Cairo')`, [userId, `${userId}@safety.invalid`, ref.country, ref.locale, ref.language]);
  await q(`INSERT INTO "Household" (id, name, timezone) VALUES ($1, 'Safety Categories Integration', 'Africa/Cairo')`, [householdId]);
  await q(`INSERT INTO "HouseholdMember" (id, "householdId", "userId", role) VALUES ($1, $2, $3, 'OWNER')`, [uuidv7(), householdId, userId]);

  console.log('Recommendation reasons');
  await ledger.addStock(householdId, userId, { foodId: ref.bread, amount: '500', unit: 'GRAM', idempotencyKey: `sc-stock-${householdId}` });
  await ledger.consumeStock(householdId, userId, { foodId: ref.bread, amount: '400', unit: 'GRAM', idempotencyKey: `sc-use-${householdId}` });
  await predictions.generateFoodDepletion(householdId);
  await recommendations.generate(householdId);
  const rec = (await q(`SELECT r.id, r.status FROM "AIRecommendation" r JOIN "AIShoppingRecommendation" d ON d."recommendationId" = r.id WHERE r."householdId" = $1 AND d."foodId" = $2`, [householdId, ref.bread]))[0];
  assert(rec, 'a SUPPLY_NEED recommendation was generated for bread', rec);
  const reasons = await q(`SELECT code FROM "AIRecommendationReason" WHERE "recommendationId" = $1 ORDER BY code`, [rec.id]);
  assert(reasons.some((r) => r.code === 'STOCK_RUNNING_LOW') && reasons.some((r) => r.code === 'BASED_ON_CONSUMPTION'), 'reasons were stored with the recommendation', reasons);
  await recommendations.runSafety(rec.id, householdId);
  const visible = await recommendations.visible(householdId, userId, 10);
  assert(visible.nodes[0]?.reasons?.length === reasons.length, 'recommendations() returns the reasons', visible.nodes[0]);

  console.log('Fail-closed catalog change');
  await q(`INSERT INTO "UserAllergyCategory" (id, "userId", "categoryId", severity) VALUES ($1, $2, $3, 'SEVERE')`, [uuidv7(), userId, ref.gluten]);
  await recommendations.recheckUser(householdId, userId);
  const beforeMembership = (await q(`SELECT status, "safetyStatus" FROM "AIRecommendation" WHERE id = $1`, [rec.id]))[0];
  assert(beforeMembership.status === 'ACTIVE', 'without the membership, bread (GRAINS) still passes a gluten allergy — the gap 0027 closes', beforeMembership);
  membershipId = uuidv7();
  await q(`INSERT INTO "FoodCategoryMembership" (id, "foodId", "categoryId") VALUES ($1, $2, $3)`, [membershipId, ref.bread, ref.gluten]);
  const reset = (await q(`SELECT status, "safetyStatus" FROM "AIRecommendation" WHERE id = $1`, [rec.id]))[0];
  assert(reset.status === 'DRAFT' && reset.safetyStatus === 'PENDING', 'adding bread→GLUTEN immediately pulled the recommendation back to review', reset);
  const queued = await q(`SELECT 1 FROM "OutboxEvent" WHERE topic = 'safety.profile.changed' AND payload->>'userId' = $1 AND "processedAt" IS NULL`, [userId]);
  assert(queued.length > 0, 'a safety re-check was queued in the outbox', queued);
  await recommendations.recheckUser(householdId, userId);
  const blocked = (await q(`SELECT status, "safetyStatus" FROM "AIRecommendation" WHERE id = $1`, [rec.id]))[0];
  assert(blocked.safetyStatus === 'BLOCKED' && blocked.status !== 'ACTIVE', 'the re-check blocks bread for the gluten allergy', blocked);

  console.log('Product label tags (productSafetyCheck)');
  await q(`INSERT INTO "Product" (id, "foodId", brand, name, barcode, "packageSize", "packageUnit") VALUES ($1, $2, 'Test', 'Tomato sauce', $3, 500, 'GRAM')`, [productId, ref.tomato, barcode]);
  assert((await productSafety.checkBarcode(userId, barcode)).status === 'SAFE', 'plain tomato product is SAFE', null);
  await q(`INSERT INTO "ProductSafetyTag" (id, "productId", "categoryId", kind) VALUES ($1, $2, $3, 'MAY_CONTAIN')`, [uuidv7(), productId, ref.nuts]);
  const allergyId = uuidv7();
  await q(`INSERT INTO "UserAllergyCategory" (id, "userId", "categoryId", severity) VALUES ($1, $2, $3, 'MILD')`, [allergyId, userId, ref.nuts]);
  const mild = await productSafety.checkBarcode(userId, barcode);
  assert(mild.status === 'WARNING' && mild.warnedFilters.includes('ALLERGY_CATEGORY'), '"may contain nuts" only warns a MILD nut allergy', mild);
  await q(`UPDATE "UserAllergyCategory" SET severity = 'LIFE_THREATENING' WHERE id = $1`, [allergyId]);
  const severe = await productSafety.checkBarcode(userId, barcode);
  assert(severe.status === 'UNSAFE' && severe.failedFilters.includes('ALLERGY_CATEGORY'), '"may contain nuts" is UNSAFE for a LIFE_THREATENING nut allergy', severe);
  assert((await productSafety.checkBarcode(userId, 'NO-SUCH-BARCODE')) === null, 'unknown barcode returns null', null);
  console.log('Safety categories integration passed.');
} finally {
  try {
    if (membershipId) await q(`DELETE FROM "FoodCategoryMembership" WHERE id = $1`, [membershipId]);
    await q(`DELETE FROM "Product" WHERE id = $1`, [productId]);
    await q(`DELETE FROM "AIRecommendation" WHERE "householdId" = $1`, [householdId]);
    await q(`DELETE FROM "AIPrediction" WHERE "householdId" = $1`, [householdId]);
    await q(`DELETE FROM "UserAllergyCategory" WHERE "userId" = $1`, [userId]);
    await q('ALTER TABLE "UserSafetyProfileEvent" DISABLE TRIGGER "UserSafetyProfileEvent_append_only"');
    await q(`DELETE FROM "UserSafetyProfileEvent" WHERE "userId" = $1`, [userId]);
    await q('ALTER TABLE "UserSafetyProfileEvent" ENABLE TRIGGER "UserSafetyProfileEvent_append_only"');
    await q('ALTER TABLE "InventoryTransaction" DISABLE TRIGGER "InventoryTransaction_append_only"');
    await q(`DELETE FROM "InventoryTransaction" WHERE "householdId" = $1`, [householdId]);
    await q(`DELETE FROM "FoodEvent" WHERE "householdId" = $1`, [householdId]);
    await q(`DELETE FROM "InventoryItem" WHERE "householdId" = $1`, [householdId]);
    await q('ALTER TABLE "InventoryTransaction" ENABLE TRIGGER "InventoryTransaction_append_only"');
    await q(`DELETE FROM "OutboxEvent" WHERE "householdId" = $1 OR payload->>'userId' = $2`, [householdId, userId]);
    await q(`DELETE FROM "UserFoodPreference" WHERE "userId" = $1`, [userId]);
    await q(`DELETE FROM "Notification" WHERE "userId" = $1`, [userId]).catch(() => undefined);
    await q(`DELETE FROM "HouseholdMember" WHERE "householdId" = $1`, [householdId]);
    await q(`DELETE FROM "Household" WHERE id = $1`, [householdId]);
    await q(`DELETE FROM "User" WHERE id = $1`, [userId]);
    await q(`DELETE FROM "SearchDocument" WHERE "sourceId" = $1`, [breadId]).catch(() => undefined);
    await q(`DELETE FROM "Food" WHERE id = $1`, [breadId]);
  } finally {
    await app.close();
    await pool.end();
  }
}
