import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../dist/app.module.js';
import { ShoppingService } from '../dist/modules/shopping/application/shopping.service.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
if (databaseUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not point at the application database.');
process.env.DATABASE_URL = databaseUrl;

const pool = new pg.Pool({ connectionString: databaseUrl });
const householdId = uuidv7();
const userId = uuidv7();
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
const shopping = app.get(ShoppingService);

try {
  const refs = await pool.query(`
    SELECT (SELECT id FROM "Country" WHERE code = 'EG') AS country_id,
           (SELECT id FROM "Locale" WHERE code = 'en-US') AS locale_id,
           (SELECT id FROM "Language" WHERE code = 'en') AS language_id,
           (SELECT id FROM "Currency" WHERE code = 'EGP') AS currency_id,
           (SELECT id FROM "Food" WHERE name = 'tomato') AS food_id`);
  const ref = refs.rows[0];
  if (Object.values(ref).some((value) => !value)) throw new Error('Reference seed is missing Country, Locale, Language, Currency or tomato Food.');
  await pool.query(`INSERT INTO "User" ("id", "email", "passwordHash", "name", "countryId", "localeId", "preferredLanguageId", "timezone") VALUES ($1, $2, 'integration-test', 'Phase Five Test', $3, $4, $5, 'Africa/Cairo')`, [userId, `${userId}@phase5.invalid`, ref.country_id, ref.locale_id, ref.language_id]);
  await pool.query(`INSERT INTO "Household" ("id", "name", "timezone") VALUES ($1, 'Phase Five Integration', 'Africa/Cairo')`, [householdId]);
  await pool.query(`INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role") VALUES ($1, $2, $3, 'OWNER')`, [uuidv7(), householdId, userId]);

  const list = await shopping.createList(householdId, { name: 'Integration groceries', idempotencyKey: `phase5-list-${householdId}` });
  const listItem = await shopping.addToList(householdId, { shoppingListId: list.id, foodId: ref.food_id, quantity: '2', unit: 'KILOGRAM', idempotencyKey: `phase5-list-item-${householdId}` });
  if (listItem.foodId !== ref.food_id) throw new Error('Shopping list item did not round-trip.');
  await shopping.updateShoppingItem(householdId, listItem.id, 'PURCHASED');
  const updatedList = await shopping.updateShoppingList(householdId, { id: list.id, name: 'Integration groceries updated', status: 'COMPLETED' });
  if (updatedList.name !== 'Integration groceries updated' || updatedList.items[0].status !== 'PURCHASED') throw new Error('Shopping list update did not round-trip.');
  if (!await shopping.deleteShoppingList(householdId, list.id) || (await shopping.shoppingLists(householdId)).length !== 0) throw new Error('Shopping list delete did not round-trip.');

  const partialOrder = await shopping.createPurchaseOrder(householdId, userId, {
    sourceName: 'Integration Market', currencyId: ref.currency_id, idempotencyKey: `phase5-order-a-${householdId}`,
    items: [{ foodId: ref.food_id, quantity: '10', unit: 'GRAM', unitPrice: '2.5000' }],
  });
  const partialItem = partialOrder.items[0];
  if (partialOrder.totalCost.amount !== '25.0000' || partialItem.unitPrice.amount !== '2.5000' || partialOrder.currency.code !== 'EGP') throw new Error('Purchase order money/currency snapshot did not round-trip.');
  await shopping.transitionPurchaseOrder(householdId, partialOrder.id, 'PLACED');
  await shopping.transitionPurchaseOrder(householdId, partialOrder.id, 'CONFIRMED');
  const firstReceipt = await shopping.receivePurchaseOrderItem(householdId, userId, partialItem.id, '4', 'GRAM', `phase5-partial-${householdId}`);
  const replay = await shopping.receivePurchaseOrderItem(householdId, userId, partialItem.id, '4', 'GRAM', `phase5-partial-${householdId}`);
  const finalReceipt = await shopping.receivePurchaseOrderItem(householdId, userId, partialItem.id, '6', 'GRAM', `phase5-final-${householdId}`);
  if (firstReceipt.replayed || !replay.replayed || finalReceipt.replayed) throw new Error('Partial receipt replay flags are incorrect.');
  await shopping.transitionPurchaseOrder(householdId, partialOrder.id, 'DELIVERED');

  const concurrentOrder = await shopping.createPurchaseOrder(householdId, userId, {
    sourceName: 'Integration Market', currencyId: ref.currency_id, idempotencyKey: `phase5-order-b-${householdId}`,
    items: [{ foodId: ref.food_id, quantity: '3', unit: 'GRAM', unitPrice: '1.0000' }],
  });
  await shopping.transitionPurchaseOrder(householdId, concurrentOrder.id, 'PLACED');
  await shopping.transitionPurchaseOrder(householdId, concurrentOrder.id, 'CONFIRMED');
  const concurrentItem = concurrentOrder.items[0];
  const simultaneous = await Promise.all([
    shopping.receivePurchaseOrderItem(householdId, userId, concurrentItem.id, '3', 'GRAM', `phase5-concurrent-${householdId}`),
    shopping.receivePurchaseOrderItem(householdId, userId, concurrentItem.id, '3', 'GRAM', `phase5-concurrent-${householdId}`),
  ]);
  if (simultaneous.filter((result) => result.replayed).length !== 1) throw new Error('Concurrent idempotent receipt did not produce exactly one replay.');

  const counts = await pool.query(`
    SELECT count(DISTINCT e.id)::int AS events,
           count(t.id)::int AS movements,
           (SELECT sum("receivedQuantity")::text FROM "PurchaseOrderItem" WHERE "householdId" = $1) AS received
    FROM "PurchaseOrderItem" pi
    LEFT JOIN "FoodEvent" e ON e."purchaseOrderItemId" = pi.id AND e."householdId" = pi."householdId"
    LEFT JOIN "InventoryTransaction" t ON t."foodEventId" = e.id AND t."householdId" = e."householdId" AND t."movementType" = 'PURCHASE_RECEIPT'
    WHERE pi."householdId" = $1`, [householdId]);
  const count = counts.rows[0];
  if (count.events !== 2 || count.movements !== 3 || count.received !== '13.000') throw new Error(`Ledger invariants failed: ${JSON.stringify(count)}`);
  console.log('Phase 5 integration passed: shopping list, currency snapshot, partial then full receipt, retry idempotency, concurrent idempotency, and one PURCHASED event per order item.');
} finally {
  try {
    await pool.query('ALTER TABLE "InventoryTransaction" DISABLE TRIGGER "InventoryTransaction_append_only"');
    await pool.query('DELETE FROM "InventoryTransaction" WHERE "householdId" = $1', [householdId]);
    await pool.query('DELETE FROM "FoodEvent" WHERE "householdId" = $1', [householdId]);
    await pool.query('DELETE FROM "InventoryItem" WHERE "householdId" = $1', [householdId]);
    await pool.query('ALTER TABLE "InventoryTransaction" ENABLE TRIGGER "InventoryTransaction_append_only"');
    await pool.query('DELETE FROM "ShoppingList" WHERE "householdId" = $1', [householdId]);
    await pool.query('DELETE FROM "PurchaseOrder" WHERE "householdId" = $1', [householdId]);
    await pool.query('DELETE FROM "HouseholdMember" WHERE "householdId" = $1', [householdId]);
    await pool.query('DELETE FROM "Household" WHERE "id" = $1', [householdId]);
    await pool.query('DELETE FROM "User" WHERE "id" = $1', [userId]);
  } finally {
    await app.close();
    await pool.end();
  }
}
