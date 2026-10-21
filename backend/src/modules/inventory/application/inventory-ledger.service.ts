import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { UnitConverter } from '@/modules/units/units.public.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { allocateFefo } from '@/modules/inventory/domain/fefo-allocator.js';

type FoodRow = { id: string; densityGPerMl: string | null; gramsPerPiece: string | null };
type BatchRow = { id: string; quantity: string; unit: Unit; version: number; estimatedExpiryAt: Date | null };
type ExistingRow = { id: string; type: string; foodId: string; quantity: string; unit: Unit; source: string; inventoryItemId: string | null; storageLocation: string | null; purchaseDate: string | null; estimatedExpiryAt: Date | null };
type LedgerRow = { inventoryItemId: string; quantityDelta: string; balanceAfter: string };
type TransactionHistoryRow = { id: string; eventId: string; movementType: string; quantityDelta: string; balanceAfter: string; createdAt: Date };

export interface StockInput {
  foodId: string;
  amount: string;
  unit: Unit;
  idempotencyKey: string;
  storageLocation?: string;
  purchaseDate?: string;
  estimatedExpiryAt?: Date;
}

export interface StockResult {
  eventId: string;
  replayed: boolean;
  foodId: string;
  quantity: string;
  unit: Unit;
  balances: Array<{ inventoryItemId: string; quantityDelta: string; balanceAfter: string }>;
}

export interface AdjustmentInput {
  inventoryItemId: string;
  delta: string;
  idempotencyKey: string;
}

export class InsufficientStockError extends DomainError {
  constructor(available: string, unit: Unit) {
    super('INSUFFICIENT_STOCK', 'There is not enough stock for this request.', 409, { available, unit });
  }
}

@Injectable()
export class InventoryLedgerService {
  constructor(private readonly transactions: TransactionRunner, private readonly converter: UnitConverter) {}

  addStock(householdId: string, actorUserId: string, input: StockInput): Promise<StockResult> {
    return this.transactions.run((tx) => this.addInTransaction(tx, householdId, actorUserId, input, 'ADDED', 'ADD', 'USER'), { householdId, userId: actorUserId });
  }

  receiveStock(householdId: string, actorUserId: string, input: StockInput): Promise<StockResult> {
    return this.transactions.run((tx) => this.addInTransaction(tx, householdId, actorUserId, input, 'PURCHASED', 'PURCHASE_RECEIPT', 'RECEIPT'), { householdId, userId: actorUserId });
  }

  /** Receive a partial or complete purchase-order line through the inventory ledger facade. */
  async receivePurchaseOrderItemWithinTransaction(tx: Tx, householdId: string, actorUserId: string, purchaseOrderItemId: string, input: StockInput): Promise<StockResult> {
    validateInput(input);
    const lines = await tx.$queryRaw<Array<{ foodId: string; quantity: string; receivedQuantity: string; unit: Unit; status: string }>>`
      SELECT pi."foodId", pi."quantity"::text AS "quantity", pi."receivedQuantity"::text AS "receivedQuantity", pi."unit"::text AS "unit", po."status"::text AS "status"
      FROM "PurchaseOrderItem" pi JOIN "PurchaseOrder" po ON po."id" = pi."purchaseOrderId"
      WHERE pi."id" = ${purchaseOrderItemId}::uuid AND pi."householdId" = ${householdId}::uuid FOR UPDATE OF po, pi`;
    const line = lines[0];
    if (!line) throw new DomainError('PURCHASE_ORDER_ITEM_NOT_FOUND', 'The purchase order item does not exist.', 404);
    const prior = await tx.$queryRaw<Array<{ eventId: string; foodId: string; amount: string; unit: Unit; itemId: string; balance: string }>>`
      SELECT t."foodEventId" AS "eventId", e."foodId", abs(t."quantityDelta")::text AS "amount", i."unit"::text AS "unit", i."id" AS "itemId", t."balanceAfter"::text AS "balance"
      FROM "InventoryTransaction" t JOIN "FoodEvent" e ON e."id" = t."foodEventId" AND e."householdId" = t."householdId"
      JOIN "InventoryItem" i ON i."id" = t."inventoryItemId" AND i."householdId" = t."householdId"
      WHERE t."householdId" = ${householdId}::uuid AND t."idempotencyKey" = ${input.idempotencyKey}`;
    if (prior.length) {
      const source = await tx.$queryRaw<Array<{ purchaseOrderItemId: string | null }>>`SELECT "purchaseOrderItemId" FROM "FoodEvent" WHERE "id" = ${prior[0].eventId}::uuid`;
      if (source[0]?.purchaseOrderItemId !== purchaseOrderItemId || prior[0].foodId !== input.foodId || prior[0].unit !== input.unit || milli(prior[0].amount) !== milli(input.amount)) throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey was already used with a different receipt.', 422);
      return { eventId: prior[0].eventId, replayed: true, foodId: prior[0].foodId, quantity: prior[0].amount, unit: prior[0].unit, balances: [{ inventoryItemId: prior[0].itemId, quantityDelta: prior[0].amount, balanceAfter: prior[0].balance }] };
    }
    if (line.status !== 'CONFIRMED') throw new DomainError('PURCHASE_ORDER_NOT_RECEIVABLE', 'Only confirmed purchase orders can receive items.', 409);
    if (line.foodId !== input.foodId || line.unit !== input.unit) throw new DomainError('PURCHASE_ORDER_ITEM_MISMATCH', 'Receipt food and unit must match the purchase order item.', 422);
    if (milli(line.receivedQuantity) + milli(input.amount) > milli(line.quantity)) throw new DomainError('RECEIPT_EXCEEDS_ORDER', 'The receipt exceeds the remaining ordered quantity.', 422);

    const food = await this.food(tx, input.foodId);
    this.converter.convert(input.amount, input.unit, Unit.GRAM, food);
    const event = await tx.$queryRaw<Array<{ id: string; quantity: string }>>`SELECT "id", "quantity"::text AS "quantity" FROM "FoodEvent" WHERE "householdId" = ${householdId}::uuid AND "purchaseOrderItemId" = ${purchaseOrderItemId}::uuid AND "type" = 'PURCHASED' FOR UPDATE`;
    let eventId = event[0]?.id ?? newId();
    const itemId = newId();
    if (!event.length) {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO "FoodEvent" ("id", "householdId", "actorUserId", "foodId", "inventoryItemId", "purchaseOrderItemId", "type", "origin", "source", "quantity", "unit", "idempotencyKey") VALUES (${eventId}::uuid, ${householdId}::uuid, ${actorUserId}::uuid, ${input.foodId}::uuid, NULL, ${purchaseOrderItemId}::uuid, 'PURCHASED', 'HOME', 'RECEIPT', ${input.amount}::numeric, ${input.unit}::"Unit", ${`po-item:${purchaseOrderItemId}`}) ON CONFLICT ("householdId", "idempotencyKey") DO NOTHING RETURNING "id"`;
      if (!inserted.length) throw new DomainError('PURCHASE_EVENT_CONFLICT', 'The purchase order item already has an incompatible purchase event.', 409);
      eventId = inserted[0].id;
    } else {
      const cumulative = milli(event[0].quantity) + milli(input.amount);
      await tx.$executeRaw`UPDATE "FoodEvent" SET "quantity" = ${formatMilli(cumulative)}::numeric WHERE "id" = ${eventId}::uuid AND "householdId" = ${householdId}::uuid`;
    }
    await tx.$executeRaw`INSERT INTO "InventoryItem" ("id", "householdId", "foodId", "quantity", "unit", "storageLocation", "purchaseDate", "estimatedExpiryAt") VALUES (${itemId}::uuid, ${householdId}::uuid, ${input.foodId}::uuid, 0, ${input.unit}::"Unit", ${input.storageLocation ?? 'PANTRY'}::"StorageLocation", ${input.purchaseDate ?? new Date().toISOString().slice(0, 10)}::date, ${input.estimatedExpiryAt ?? null}::timestamptz)`;
    if (!event.length) await tx.$executeRaw`UPDATE "FoodEvent" SET "inventoryItemId" = ${itemId}::uuid WHERE "id" = ${eventId}::uuid AND "householdId" = ${householdId}::uuid`;
    await tx.$executeRaw`SELECT set_config('app.inventory_ledger_write', 'true', true)`;
    const updated = await tx.$queryRaw<Array<{ quantity: string }>>`UPDATE "InventoryItem" SET "quantity" = ${input.amount}::numeric, "version" = "version" + 1 WHERE "id" = ${itemId}::uuid AND "householdId" = ${householdId}::uuid AND "version" = 1 AND "quantity" = 0 RETURNING "quantity"::text AS "quantity"`;
    if (!updated.length) throw new DomainError('INVENTORY_CONFLICT', 'Could not safely add the received batch.', 409);
    await tx.$executeRaw`INSERT INTO "InventoryTransaction" ("id", "householdId", "inventoryItemId", "foodEventId", "origin", "movementType", "quantityDelta", "balanceAfter", "idempotencyKey") VALUES (${newId()}::uuid, ${householdId}::uuid, ${itemId}::uuid, ${eventId}::uuid, 'HOME', 'PURCHASE_RECEIPT', ${input.amount}::numeric, ${updated[0].quantity}::numeric, ${input.idempotencyKey})`;
    await tx.$executeRaw`UPDATE "PurchaseOrderItem" SET "receivedQuantity" = "receivedQuantity" + ${input.amount}::numeric WHERE "id" = ${purchaseOrderItemId}::uuid AND "householdId" = ${householdId}::uuid`;
    return { eventId, replayed: false, foodId: input.foodId, quantity: input.amount, unit: input.unit, balances: [{ inventoryItemId: itemId, quantityDelta: input.amount, balanceAfter: updated[0].quantity }] };
  }

  consumeStock(householdId: string, actorUserId: string, input: StockInput): Promise<StockResult> {
    return this.transactions.run((tx) => this.consumeInTransaction(tx, householdId, actorUserId, input, 'EATEN', 'CONSUMPTION'), { householdId, userId: actorUserId });
  }

  /** Lets a higher-level use case consume inventory inside its own atomic transaction. */
  consumeWithinTransaction(tx: Tx, householdId: string, actorUserId: string, input: StockInput): Promise<StockResult> {
    return this.consumeInTransaction(tx, householdId, actorUserId, input, 'EATEN', 'CONSUMPTION');
  }

  discardStock(householdId: string, actorUserId: string, input: StockInput): Promise<StockResult> {
    return this.transactions.run((tx) => this.consumeInTransaction(tx, householdId, actorUserId, input, 'WASTED', 'DAMAGE_WASTE'), { householdId, userId: actorUserId });
  }

  adjustStock(householdId: string, actorUserId: string, input: AdjustmentInput): Promise<StockResult> {
    return this.transactions.run((tx) => this.adjustInTransaction(tx, householdId, actorUserId, input), { householdId, userId: actorUserId });
  }

  async list(householdId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const afterId = decodeCursor(after);
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT i."id", i."foodId", f."name" AS "foodName", i."quantity"::text AS "quantity", i."unit"::text AS "unit",
               i."storageLocation"::text AS "storageLocation", i."estimatedExpiryAt", i."version"
        FROM "InventoryItem" i JOIN "Food" f ON f."id" = i."foodId"
        WHERE i."householdId" = ${householdId}::uuid AND i."archivedAt" IS NULL AND (${afterId}::uuid IS NULL OR i."id" > ${afterId}::uuid)
        ORDER BY i."id" LIMIT ${first + 1}`;
      const hasNextPage = rows.length > first;
      const nodes = rows.slice(0, first);
      return { nodes, hasNextPage, endCursor: nodes.length ? Buffer.from(String(nodes[nodes.length - 1].id)).toString('base64url') : null };
    }, { householdId });
  }

  async item(householdId: string, itemId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const cursor = decodeTransactionCursor(after);
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT i."id", i."foodId", f."name" AS "foodName", i."quantity"::text AS "quantity", i."unit"::text AS "unit",
                i."storageLocation"::text AS "storageLocation", i."estimatedExpiryAt", i."version"
         FROM "InventoryItem" i JOIN "Food" f ON f."id" = i."foodId"
         WHERE i."householdId" = ${householdId}::uuid AND i."id" = ${itemId}::uuid AND i."archivedAt" IS NULL`;
      if (!rows.length) throw new DomainError('INVENTORY_ITEM_NOT_FOUND', 'The selected inventory batch does not exist.', 404);
      const history = await tx.$queryRaw<TransactionHistoryRow[]>`
        SELECT "id", "foodEventId" AS "eventId", "movementType"::text AS "movementType", "quantityDelta"::text AS "quantityDelta", "balanceAfter"::text AS "balanceAfter", "createdAt"
        FROM "InventoryTransaction" WHERE "householdId" = ${householdId}::uuid AND "inventoryItemId" = ${itemId}::uuid
          AND (${cursor ?? null}::uuid IS NULL OR ("createdAt", "id") > (SELECT c."createdAt", c."id" FROM "InventoryTransaction" c WHERE c."id" = ${cursor ?? null}::uuid AND c."householdId" = ${householdId}::uuid AND c."inventoryItemId" = ${itemId}::uuid))
        ORDER BY "createdAt", "id" LIMIT ${first + 1}`;
      const hasNextPage = history.length > first;
      const nodes = history.slice(0, first);
      const last = nodes[nodes.length - 1];
      return { ...rows[0], transactions: { nodes, hasNextPage, endCursor: last ? encodeTransactionCursor(last.id) : null } };
    }, { householdId });
  }

  private async addInTransaction(tx: Tx, householdId: string, actorUserId: string, input: StockInput, eventType: 'ADDED' | 'PURCHASED', movementType: 'ADD' | 'PURCHASE_RECEIPT', source: 'USER' | 'RECEIPT'): Promise<StockResult> {
    validateInput(input);
    const food = await this.food(tx, input.foodId);
    const eventId = newId();
    const inserted = await insertEvent(tx, eventId, householdId, actorUserId, food.id, null, eventType, source, input);
    if (!inserted) {
      const existing = await findEvent(tx, householdId, input.idempotencyKey);
      if (!existing) throw new DomainError('INVENTORY_CONFLICT', 'Could not safely resolve the repeated request.', 409);
      assertReplayMatches(existing, food.id, eventType, source, input);
      return loadReplay(tx, householdId, existing);
    }
    const itemId = newId();
    await tx.$executeRaw`INSERT INTO "InventoryItem" ("id", "householdId", "foodId", "quantity", "unit", "storageLocation", "purchaseDate", "estimatedExpiryAt") VALUES (${itemId}::uuid, ${householdId}::uuid, ${food.id}::uuid, 0, ${input.unit}::"Unit", ${input.storageLocation ?? 'PANTRY'}::"StorageLocation", ${input.purchaseDate ?? null}::date, ${input.estimatedExpiryAt ?? null}::timestamptz)`;
    await tx.$executeRaw`UPDATE "FoodEvent" SET "inventoryItemId" = ${itemId}::uuid WHERE "id" = ${eventId}::uuid AND "householdId" = ${householdId}::uuid`;
    await tx.$executeRaw`SELECT set_config('app.inventory_ledger_write', 'true', true)`;
    const updated = await tx.$queryRaw<Array<{ quantity: string; version: number }>>`UPDATE "InventoryItem" SET "quantity" = ${input.amount}::numeric, "version" = "version" + 1 WHERE "id" = ${itemId}::uuid AND "householdId" = ${householdId}::uuid AND "version" = 1 AND "quantity" = 0 RETURNING "quantity"::text AS "quantity", "version"`;
    if (!updated.length) throw new DomainError('INVENTORY_CONFLICT', 'The inventory batch changed while it was being written.', 409);
    await insertTransaction(tx, householdId, itemId, eventId, movementType, input.amount, updated[0].quantity, `ledger:${eventId}:${itemId}`);
    return { eventId, replayed: false, foodId: food.id, quantity: input.amount, unit: input.unit, balances: [{ inventoryItemId: itemId, quantityDelta: input.amount, balanceAfter: updated[0].quantity }] };
  }

  private async consumeInTransaction(tx: Tx, householdId: string, actorUserId: string, input: StockInput, eventType: 'EATEN' | 'WASTED', movementType: 'CONSUMPTION' | 'DAMAGE_WASTE'): Promise<StockResult> {
    validateInput(input);
    const food = await this.food(tx, input.foodId);
    const eventId = newId();
    const inserted = await insertEvent(tx, eventId, householdId, actorUserId, food.id, null, eventType, 'USER', input);
    if (!inserted) {
      const existing = await findEvent(tx, householdId, input.idempotencyKey);
      if (!existing) throw new DomainError('INVENTORY_CONFLICT', 'Could not safely resolve the repeated request.', 409);
      assertReplayMatches(existing, food.id, eventType, 'USER', input);
      return loadReplay(tx, householdId, existing);
    }
    // Lock batches in stable id order; FEFO order is applied only after every lock is held.
    const batches = await tx.$queryRaw<BatchRow[]>`
      SELECT "id", "quantity"::text AS "quantity", "unit"::text AS "unit", "version", "estimatedExpiryAt"
      FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid AND "foodId" = ${food.id}::uuid AND "archivedAt" IS NULL AND "quantity" > 0
      ORDER BY "id" FOR UPDATE`;
    const normalized = batches.map((batch) => ({ ...batch, available: this.converter.convert(batch.quantity, batch.unit, input.unit, food) }));
    const allocations = allocateFefo(input.amount, normalized.map((b) => ({ id: b.id, quantity: b.available, estimatedExpiryAt: b.estimatedExpiryAt })));
    if (!allocations) {
      const available = formatMilli(normalized.reduce((sum, b) => sum + milli(b.available), 0n));
      throw new InsufficientStockError(available, input.unit);
    }

    await tx.$executeRaw`SELECT set_config('app.inventory_ledger_write', 'true', true)`;
    const results: StockResult['balances'] = [];
    for (const allocation of allocations) {
      const batch = batches.find((candidate) => candidate.id === allocation.id)!;
      const normalizedBatch = normalized.find((candidate) => candidate.id === batch.id)!;
      const take = allocation.amount === normalizedBatch.available ? batch.quantity : this.converter.convert(allocation.amount, input.unit, batch.unit, food);
      const updated = await tx.$queryRaw<Array<{ quantity: string; version: number }>>`
        UPDATE "InventoryItem" SET "quantity" = "quantity" - ${take}::numeric, "version" = "version" + 1
        WHERE "id" = ${batch.id}::uuid AND "householdId" = ${householdId}::uuid AND "version" = ${batch.version} AND "quantity" >= ${take}::numeric
        RETURNING "quantity"::text AS "quantity", "version"`;
      if (!updated.length) throw new DomainError('INVENTORY_CONFLICT', 'The inventory batch changed while it was being consumed.', 409);
      await insertTransaction(tx, householdId, batch.id, eventId, movementType, `-${take}`, updated[0].quantity, `ledger:${eventId}:${batch.id}`);
      results.push({ inventoryItemId: batch.id, quantityDelta: `-${take}`, balanceAfter: updated[0].quantity });
    }
    return { eventId, replayed: false, foodId: food.id, quantity: input.amount, unit: input.unit, balances: results };
  }

  private async adjustInTransaction(tx: Tx, householdId: string, actorUserId: string, input: AdjustmentInput): Promise<StockResult> {
    validateAdjustment(input);
    const deltaMilli = signedMilli(input.delta);
    const amount = formatMilli(deltaMilli < 0n ? -deltaMilli : deltaMilli);
    const eventType = deltaMilli > 0n ? 'ADDED' : 'REMOVED';
    const existing = await findEvent(tx, householdId, input.idempotencyKey);
    if (existing) {
      assertAdjustmentReplay(existing, input, eventType, amount);
      return loadReplay(tx, householdId, existing);
    }

    const initial = await tx.$queryRaw<Array<{ foodId: string; unit: Unit }>>`SELECT "foodId", "unit"::text AS "unit" FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid AND "id" = ${input.inventoryItemId}::uuid AND "archivedAt" IS NULL`;
    if (!initial.length) throw new DomainError('INVENTORY_ITEM_NOT_FOUND', 'The selected inventory batch does not exist.', 404);
    const food = await this.food(tx, initial[0].foodId);
    const eventId = newId();
    const eventInput: StockInput = { foodId: food.id, amount, unit: initial[0].unit, idempotencyKey: input.idempotencyKey };
    const inserted = await insertEvent(tx, eventId, householdId, actorUserId, food.id, input.inventoryItemId, eventType, 'USER', eventInput);
    if (!inserted) {
      const replay = await findEvent(tx, householdId, input.idempotencyKey);
      if (!replay) throw new DomainError('INVENTORY_CONFLICT', 'Could not safely resolve the repeated request.', 409);
      assertAdjustmentReplay(replay, input, eventType, amount);
      return loadReplay(tx, householdId, replay);
    }

    const batches = await tx.$queryRaw<Array<{ id: string; quantity: string; version: number }>>`SELECT "id", "quantity"::text AS "quantity", "version" FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid AND "id" = ${input.inventoryItemId}::uuid AND "archivedAt" IS NULL ORDER BY "id" FOR UPDATE`;
    if (!batches.length) throw new DomainError('INVENTORY_ITEM_NOT_FOUND', 'The selected inventory batch does not exist.', 404);
    await tx.$executeRaw`SELECT set_config('app.inventory_ledger_write', 'true', true)`;
    const updated = await tx.$queryRaw<Array<{ quantity: string; version: number }>>`
      UPDATE "InventoryItem" SET "quantity" = "quantity" + ${input.delta}::numeric, "version" = "version" + 1
      WHERE "id" = ${input.inventoryItemId}::uuid AND "householdId" = ${householdId}::uuid AND "version" = ${batches[0].version}
        AND "quantity" + ${input.delta}::numeric >= 0
      RETURNING "quantity"::text AS "quantity", "version"`;
    if (!updated.length) throw new InsufficientStockError(batches[0].quantity, initial[0].unit);
    await insertTransaction(tx, householdId, input.inventoryItemId, eventId, 'STOCK_AUDIT_ADJUSTMENT', input.delta, updated[0].quantity, `ledger:${eventId}:${input.inventoryItemId}`);
    return { eventId, replayed: false, foodId: food.id, quantity: amount, unit: initial[0].unit, balances: [{ inventoryItemId: input.inventoryItemId, quantityDelta: input.delta, balanceAfter: updated[0].quantity }] };
  }

  private async food(tx: Tx, foodId: string): Promise<FoodRow> {
    const rows = await tx.$queryRaw<FoodRow[]>`SELECT "id", "densityGPerMl"::text AS "densityGPerMl", "gramsPerPiece"::text AS "gramsPerPiece" FROM "Food" WHERE "id" = ${foodId}::uuid AND "archivedAt" IS NULL`;
    if (!rows.length) throw new DomainError('FOOD_NOT_FOUND', 'The selected food does not exist.', 404);
    return rows[0];
  }
}

function validateInput(input: StockInput): void {
  if (!/^\d+(?:\.\d{1,3})?$/.test(input.amount) || milli(input.amount) <= 0n || milli(input.amount) > 999_999_999_999n) throw new DomainError('INVALID_QUANTITY', 'Quantity must be between 0.001 and 999999999.999.');
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must contain 1 to 200 characters.');
}

function decodeCursor(after?: string): string | null {
  if (!after) return null;
  const id = Buffer.from(after, 'base64url').toString();
  const isCanonicalBase64 = Buffer.from(id).toString('base64url') === after;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isCanonicalBase64 || !isUuid) throw new DomainError('INVALID_CURSOR', 'The inventory cursor is invalid.');
  return id;
}

function encodeTransactionCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

function decodeTransactionCursor(after?: string): string | null {
  if (!after) return null;
  try {
    const decoded = Buffer.from(after, 'base64url').toString();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded) || Buffer.from(decoded).toString('base64url') !== after) throw new Error('invalid cursor');
    return decoded;
  } catch { throw new DomainError('INVALID_CURSOR', 'The inventory transaction cursor is invalid.'); }
}

async function findEvent(tx: Tx, householdId: string, key: string): Promise<ExistingRow | null> {
  const rows = await tx.$queryRaw<ExistingRow[]>`SELECT e."id", e."type"::text AS "type", e."foodId", e."quantity"::text AS "quantity", e."unit"::text AS "unit", e."source"::text AS "source", e."inventoryItemId", i."storageLocation"::text AS "storageLocation", i."purchaseDate"::text AS "purchaseDate", i."estimatedExpiryAt" FROM "FoodEvent" e LEFT JOIN "InventoryItem" i ON i."id" = e."inventoryItemId" AND i."householdId" = e."householdId" WHERE e."householdId" = ${householdId}::uuid AND e."idempotencyKey" = ${key}`;
  return rows[0] ?? null;
}

async function loadReplay(tx: Tx, householdId: string, event: ExistingRow): Promise<StockResult> {
  const rows = await tx.$queryRaw<LedgerRow[]>`SELECT "inventoryItemId", "quantityDelta"::text AS "quantityDelta", "balanceAfter"::text AS "balanceAfter" FROM "InventoryTransaction" WHERE "householdId" = ${householdId}::uuid AND "foodEventId" = ${event.id}::uuid ORDER BY "inventoryItemId"`;
  return { eventId: event.id, replayed: true, foodId: event.foodId, quantity: event.quantity, unit: event.unit, balances: rows };
}

function assertReplayMatches(event: ExistingRow, foodId: string, type: 'ADDED' | 'PURCHASED' | 'EATEN' | 'WASTED', source: 'USER' | 'RECEIPT', input: StockInput): void {
  const samePayload = event.foodId === foodId && event.type === type && event.source === source && event.unit === input.unit && milli(event.quantity) === milli(input.amount)
    && (!(type === 'ADDED' || type === 'PURCHASED') || (event.storageLocation === (input.storageLocation ?? 'PANTRY') && event.purchaseDate === (input.purchaseDate ?? null) && (event.estimatedExpiryAt?.getTime() ?? null) === (input.estimatedExpiryAt?.getTime() ?? null)));
  if (!samePayload) {
    throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey was already used with a different request.', 422);
  }
}

function validateAdjustment(input: AdjustmentInput): void {
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(input.delta) || signedMilli(input.delta) === 0n || (signedMilli(input.delta) < 0n ? -signedMilli(input.delta) : signedMilli(input.delta)) > 999_999_999_999n) throw new DomainError('INVALID_QUANTITY', 'Adjustment delta must be nonzero and within supported precision.');
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must contain 1 to 200 characters.');
}

function signedMilli(value: string): bigint { const negative = value.startsWith('-'); const amount = milli(negative ? value.slice(1) : value); return negative ? -amount : amount; }

function assertAdjustmentReplay(event: ExistingRow, input: AdjustmentInput, type: 'ADDED' | 'REMOVED', amount: string): void {
  if (event.type !== type || event.source !== 'USER' || event.inventoryItemId !== input.inventoryItemId || milli(event.quantity) !== milli(amount)) throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey was already used with a different request.', 422);
}

function milli(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function formatMilli(value: bigint): string {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;
}

async function insertEvent(tx: Tx, id: string, householdId: string, actorUserId: string, foodId: string, itemId: string | null, type: 'ADDED' | 'PURCHASED' | 'EATEN' | 'WASTED' | 'REMOVED', source: 'USER' | 'RECEIPT', input: StockInput): Promise<boolean> {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO "FoodEvent" ("id", "householdId", "actorUserId", "foodId", "inventoryItemId", "type", "origin", "source", "quantity", "unit", "idempotencyKey") VALUES (${id}::uuid, ${householdId}::uuid, ${actorUserId}::uuid, ${foodId}::uuid, ${itemId}::uuid, ${type}::"FoodEventType", 'HOME'::"ItemOrigin", ${source}::"EventSource", ${input.amount}::numeric, ${input.unit}::"Unit", ${input.idempotencyKey}) ON CONFLICT ("householdId", "idempotencyKey") DO NOTHING RETURNING "id"`;
  return inserted.length > 0;
}

async function insertTransaction(tx: Tx, householdId: string, itemId: string, eventId: string, type: 'ADD' | 'PURCHASE_RECEIPT' | 'CONSUMPTION' | 'DAMAGE_WASTE' | 'STOCK_AUDIT_ADJUSTMENT', delta: string, balance: string, key: string): Promise<void> {
  await tx.$executeRaw`INSERT INTO "InventoryTransaction" ("id", "householdId", "inventoryItemId", "foodEventId", "origin", "movementType", "quantityDelta", "balanceAfter", "idempotencyKey") VALUES (${newId()}::uuid, ${householdId}::uuid, ${itemId}::uuid, ${eventId}::uuid, 'HOME'::"ItemOrigin", ${type}::"InventoryTransactionType", ${delta}::numeric, ${balance}::numeric, ${key})`;
}
