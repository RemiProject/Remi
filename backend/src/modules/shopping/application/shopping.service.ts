import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { InventoryLedgerService } from '@/modules/inventory/application/inventory-ledger.service.js';
import type { StockInput } from '@/modules/inventory/application/inventory-ledger.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { PurchaseOrderStateMachine, type PurchaseOrderStatusValue } from '@/modules/shopping/domain/purchase-order-state-machine.js';

export type ShoppingItemStatusValue = 'NEEDED' | 'PURCHASED' | 'SKIPPED';
export interface CreateShoppingListInput { name: string; idempotencyKey: string }
export interface UpdateShoppingListInput { id: string; name?: string; status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' }
export interface AddShoppingItemInput { shoppingListId: string; foodId: string; productId?: string; quantity: string; unit: Unit; idempotencyKey: string }
export interface PurchaseLineInput { foodId: string; productId?: string; quantity: string; unit: Unit; unitPrice: string }
export interface CreatePurchaseOrderInput { sourceName: string; productSourceId?: string; currencyId: string; idempotencyKey: string; items: PurchaseLineInput[] }

@Injectable()
export class ShoppingService {
  constructor(private readonly transactions: TransactionRunner, private readonly inventory: InventoryLedgerService) {}

  async createList(householdId: string, input: CreateShoppingListInput) {
    const name = input.name.trim(); validateKey(input.idempotencyKey);
    const hash = requestHash({ name });
    return this.transactions.run(async (tx) => {
      const prior = await tx.$queryRaw<Array<{ id: string; name: string; status: string; requestHash: string; createdAt: Date; updatedAt: Date }>>`SELECT "id", "name", "status"::text AS "status", "requestHash", "createdAt", "updatedAt" FROM "ShoppingList" WHERE "householdId" = ${householdId}::uuid AND "idempotencyKey" = ${input.idempotencyKey}`;
      if (prior.length) { assertReplay(prior[0].requestHash, hash); return { ...prior[0], items: await this.listItems(tx, prior[0].id, householdId) }; }
      const id = newId();
      const created = await tx.$queryRaw<Array<{ createdAt: Date; updatedAt: Date }>>`INSERT INTO "ShoppingList" ("id", "householdId", "name", "idempotencyKey", "requestHash") VALUES (${id}::uuid, ${householdId}::uuid, ${name}, ${input.idempotencyKey}, ${hash}) RETURNING "createdAt", "updatedAt"`;
      return { id, name, status: 'ACTIVE', createdAt: created[0].createdAt, updatedAt: created[0].updatedAt, items: [] };
    }, { householdId });
  }

  async addToList(householdId: string, input: AddShoppingItemInput) {
    validateQuantity(input.quantity); validateKey(input.idempotencyKey);
    const hash = requestHash({ ...input, quantity: normalizeDecimal(input.quantity) });
    return this.transactions.run(async (tx) => {
      const prior = await tx.$queryRaw<Array<Record<string, any>>>`SELECT i."id", i."shoppingListId", i."householdId", i."foodId", i."productId", i."quantity"::text AS "quantity", i."unit"::text AS "unit", i."status"::text AS "status", i."requestHash", f."name" AS "foodName", p."name" AS "productName" FROM "ShoppingListItem" i JOIN "Food" f ON f."id" = i."foodId" LEFT JOIN "Product" p ON p."id" = i."productId" WHERE i."householdId" = ${householdId}::uuid AND i."idempotencyKey" = ${input.idempotencyKey}`;
      if (prior.length) { assertReplay(prior[0].requestHash, hash); return prior[0]; }
      const lists = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status"::text AS "status" FROM "ShoppingList" WHERE "id" = ${input.shoppingListId}::uuid AND "householdId" = ${householdId}::uuid FOR UPDATE`;
      if (!lists.length) throw new DomainError('SHOPPING_LIST_NOT_FOUND', 'The shopping list does not exist.', 404);
      if (lists[0].status !== 'ACTIVE') throw new DomainError('SHOPPING_LIST_NOT_ACTIVE', 'Items can only be added to an active shopping list.', 409);
      const id = newId();
      await tx.$executeRaw`INSERT INTO "ShoppingListItem" ("id", "shoppingListId", "householdId", "foodId", "productId", "quantity", "unit", "idempotencyKey", "requestHash") VALUES (${id}::uuid, ${input.shoppingListId}::uuid, ${householdId}::uuid, ${input.foodId}::uuid, ${input.productId ?? null}::uuid, ${input.quantity}::numeric, ${input.unit}::"Unit", ${input.idempotencyKey}, ${hash})`;
      const rows = await this.listItems(tx, input.shoppingListId, householdId);
      return rows.find((row) => row.id === id)!;
    }, { householdId });
  }

  async updateShoppingItem(householdId: string, id: string, status: ShoppingItemStatusValue) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; shoppingListId: string }>>`UPDATE "ShoppingListItem" SET "status" = ${status}::"ShoppingItemStatus", "updatedAt" = now() WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid RETURNING "id", "shoppingListId"`;
      if (!rows.length) throw new DomainError('SHOPPING_ITEM_NOT_FOUND', 'The shopping list item does not exist.', 404);
      return (await this.listItems(tx, rows[0].shoppingListId, householdId)).find((item: any) => item.id === id);
    }, { householdId });
  }

  async updateShoppingList(householdId: string, input: UpdateShoppingListInput) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; name: string; status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'; createdAt: Date; updatedAt: Date }>>`SELECT "id", "name", "status"::text AS "status", "createdAt", "updatedAt" FROM "ShoppingList" WHERE "id" = ${input.id}::uuid AND "householdId" = ${householdId}::uuid FOR UPDATE`;
      if (!rows.length) throw new DomainError('SHOPPING_LIST_NOT_FOUND', 'The shopping list does not exist.', 404);
      const current = rows[0];
      const status = input.status ?? current.status;
      const name = input.name?.trim() ?? current.name;
      if (input.name !== undefined && (!name || name.length > 200)) throw new DomainError('INVALID_SHOPPING_LIST_NAME', 'Shopping list name must contain 1 to 200 characters.');
      if (current.status !== status && (current.status !== 'ACTIVE' || status === 'ACTIVE')) throw new DomainError('INVALID_SHOPPING_LIST_TRANSITION', `Cannot transition a shopping list from ${current.status} to ${status}.`, 409);
      const changed = current.status !== status || current.name !== name;
      const updated = !changed
        ? current
        : (await tx.$queryRaw<Array<{ updatedAt: Date }>>`UPDATE "ShoppingList" SET "name" = ${name}, "status" = ${status}::"ShoppingListStatus", "updatedAt" = now() WHERE "id" = ${input.id}::uuid AND "householdId" = ${householdId}::uuid RETURNING "updatedAt"`)[0];
      return { ...current, name, status, updatedAt: updated.updatedAt, items: await this.listItems(tx, input.id, householdId) };
    }, { householdId });
  }

  async deleteShoppingList(householdId: string, id: string): Promise<boolean> {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`DELETE FROM "ShoppingList" WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid RETURNING "id"`;
      if (!rows.length) throw new DomainError('SHOPPING_LIST_NOT_FOUND', 'The shopping list does not exist.', 404);
      return true;
    }, { householdId });
  }

  async shoppingLists(householdId: string) {
    return this.transactions.run(async (tx) => {
      const lists = await tx.$queryRaw<Array<{ id: string; name: string; status: string; createdAt: Date; updatedAt: Date }>>`SELECT "id", "name", "status"::text AS "status", "createdAt", "updatedAt" FROM "ShoppingList" WHERE "householdId" = ${householdId}::uuid ORDER BY "updatedAt" DESC, "id"`;
      return Promise.all(lists.map(async (list) => ({ ...list, items: await this.listItems(tx, list.id, householdId) })));
    }, { householdId });
  }

  async createPurchaseOrder(householdId: string, actorUserId: string, input: CreatePurchaseOrderInput) {
    validateKey(input.idempotencyKey);
    if (!input.items.length || input.items.length > 100) throw new DomainError('INVALID_PURCHASE_ORDER', 'A purchase order requires between 1 and 100 items.');
    const hash = requestHash(input);
    return this.transactions.run(async (tx) => {
      const prior = await tx.$queryRaw<Array<{ id: string; requestHash: string }>>`SELECT "id", "requestHash" FROM "PurchaseOrder" WHERE "householdId" = ${householdId}::uuid AND "idempotencyKey" = ${input.idempotencyKey}`;
      if (prior.length) { assertReplay(prior[0].requestHash, hash); return this.getPurchaseOrder(tx, householdId, prior[0].id); }
      const currency = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Currency" WHERE "id" = ${input.currencyId}::uuid AND "isActive"`;
      if (!currency.length) throw new DomainError('CURRENCY_NOT_FOUND', 'The selected active currency does not exist.', 404);
      let sourceName = input.sourceName.trim();
      if (input.productSourceId) {
        const sources = await tx.$queryRaw<Array<{ sourceName: string; currencyId: string }>>`SELECT "sourceName", "currencyId" FROM "ProductSource" WHERE "id" = ${input.productSourceId}::uuid`;
        if (!sources.length) throw new DomainError('PRODUCT_SOURCE_NOT_FOUND', 'The selected product source does not exist.', 404);
        if (sources[0].currencyId !== input.currencyId) throw new DomainError('CURRENCY_MISMATCH', 'The selected source price uses a different currency.', 422);
        sourceName = sources[0].sourceName;
      }
      if (!sourceName) throw new DomainError('INVALID_PURCHASE_ORDER', 'sourceName is required.');
      const id = newId();
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id", "householdId", "createdByUserId", "productSourceId", "sourceName", "currencyId", "idempotencyKey", "requestHash") VALUES (${id}::uuid, ${householdId}::uuid, ${actorUserId}::uuid, ${input.productSourceId ?? null}::uuid, ${sourceName}, ${input.currencyId}::uuid, ${input.idempotencyKey}, ${hash})`;
      for (const line of input.items) {
        validateQuantity(line.quantity); validateMoney(line.unitPrice);
        await tx.$executeRaw`INSERT INTO "PurchaseOrderItem" ("id", "purchaseOrderId", "householdId", "foodId", "productId", "quantity", "unit", "unitPrice", "currencyId") VALUES (${newId()}::uuid, ${id}::uuid, ${householdId}::uuid, ${line.foodId}::uuid, ${line.productId ?? null}::uuid, ${line.quantity}::numeric, ${line.unit}::"Unit", ${line.unitPrice}::numeric, ${input.currencyId}::uuid)`;
      }
      await tx.$executeRaw`UPDATE "PurchaseOrder" SET "totalCost" = (SELECT COALESCE(sum("totalPrice"), 0) FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = ${id}::uuid), "updatedAt" = now() WHERE "id" = ${id}::uuid`;
      return this.getPurchaseOrder(tx, householdId, id);
    }, { householdId, userId: actorUserId });
  }

  async transitionPurchaseOrder(householdId: string, id: string, next: PurchaseOrderStatusValue) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: PurchaseOrderStatusValue }>>`SELECT "status"::text AS "status" FROM "PurchaseOrder" WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid FOR UPDATE`;
      if (!rows.length) throw new DomainError('PURCHASE_ORDER_NOT_FOUND', 'The purchase order does not exist.', 404);
      const current = rows[0].status;
      PurchaseOrderStateMachine.assertTransition(current, next);
      if (next === 'DELIVERED') {
        const incomplete = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = ${id}::uuid AND "receivedQuantity" < "quantity"`;
        if (incomplete[0].count > 0n) throw new DomainError('PURCHASE_ORDER_INCOMPLETE', 'A purchase order cannot be delivered before all items are received.', 409);
      }
      const timestampColumn = next === 'PLACED' ? 'orderedAt' : next === 'CONFIRMED' ? 'confirmedAt' : next === 'DELIVERED' ? 'deliveredAt' : null;
      if (current !== next) {
        if (timestampColumn === 'orderedAt') await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status" = ${next}::"PurchaseOrderStatus", "orderedAt" = now(), "updatedAt" = now() WHERE "id" = ${id}::uuid`;
        else if (timestampColumn === 'confirmedAt') await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status" = ${next}::"PurchaseOrderStatus", "confirmedAt" = now(), "updatedAt" = now() WHERE "id" = ${id}::uuid`;
        else if (timestampColumn === 'deliveredAt') await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status" = ${next}::"PurchaseOrderStatus", "deliveredAt" = now(), "updatedAt" = now() WHERE "id" = ${id}::uuid`;
        else await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status" = ${next}::"PurchaseOrderStatus", "updatedAt" = now() WHERE "id" = ${id}::uuid`;
      }
      return this.getPurchaseOrder(tx, householdId, id);
    }, { householdId });
  }

  async receivePurchaseOrderItem(householdId: string, actorUserId: string, id: string, amount: string, unit: Unit, idempotencyKey: string) {
    validateQuantity(amount); validateKey(idempotencyKey);
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ foodId: string }>>`SELECT "foodId" FROM "PurchaseOrderItem" WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid`;
      if (!rows.length) throw new DomainError('PURCHASE_ORDER_ITEM_NOT_FOUND', 'The purchase order item does not exist.', 404);
      const stockInput: StockInput = { foodId: rows[0].foodId, amount, unit, idempotencyKey };
      const receipt = await this.inventory.receivePurchaseOrderItemWithinTransaction(tx, householdId, actorUserId, id, stockInput);
      const order = await this.getPurchaseOrderByItem(tx, householdId, id);
      return { ...receipt, purchaseOrderId: order.id, purchaseOrderStatus: order.status };
    }, { householdId, userId: actorUserId });
  }

  async purchaseOrders(householdId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const afterId = after ? decodeCursor(after) : null;
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PurchaseOrder" WHERE "householdId" = ${householdId}::uuid AND (${afterId}::uuid IS NULL OR "id" > ${afterId}::uuid) ORDER BY "id" LIMIT ${first + 1}`;
      const hasNextPage = rows.length > first;
      const orders = await Promise.all(rows.slice(0, first).map((row) => this.getPurchaseOrder(tx, householdId, row.id)));
      return { nodes: orders, hasNextPage, endCursor: orders.length ? encodeCursor(String(orders[orders.length - 1].id)) : null };
    }, { householdId });
  }

  private async listItems(tx: Tx, listId: string, householdId: string) {
    return tx.$queryRaw<Array<Record<string, unknown>>>`SELECT i."id", i."shoppingListId", i."foodId", f."name" AS "foodName", i."productId", p."name" AS "productName", i."quantity"::text AS "quantity", i."unit"::text AS "unit", i."status"::text AS "status" FROM "ShoppingListItem" i JOIN "Food" f ON f."id" = i."foodId" LEFT JOIN "Product" p ON p."id" = i."productId" WHERE i."shoppingListId" = ${listId}::uuid AND i."householdId" = ${householdId}::uuid ORDER BY i."createdAt", i."id"`;
  }

  private async getPurchaseOrder(tx: Tx, householdId: string, id: string): Promise<Record<string, any>> {
    const orders = await tx.$queryRaw<Array<Record<string, any>>>`SELECT po."id", po."sourceName", po."status"::text AS "status", po."totalCost"::text AS "totalCost", po."currencyId", c."code" AS "currencyCode", c."name" AS "currencyName", c."symbol" AS "currencySymbol", c."decimalPlaces" AS "currencyDecimalPlaces", po."orderedAt", po."confirmedAt", po."deliveredAt", po."createdAt" FROM "PurchaseOrder" po JOIN "Currency" c ON c."id" = po."currencyId" WHERE po."id" = ${id}::uuid AND po."householdId" = ${householdId}::uuid`;
    if (!orders.length) throw new DomainError('PURCHASE_ORDER_NOT_FOUND', 'The purchase order does not exist.', 404);
    const currency = { id: orders[0].currencyId, code: orders[0].currencyCode, name: orders[0].currencyName, symbol: orders[0].currencySymbol, decimalPlaces: orders[0].currencyDecimalPlaces };
    const rawItems = await tx.$queryRaw<Array<Record<string, any>>>`SELECT pi."id", pi."foodId", f."name" AS "foodName", pi."productId", p."name" AS "productName", pi."quantity"::text AS "quantity", pi."receivedQuantity"::text AS "receivedQuantity", pi."unit"::text AS "unit", pi."unitPrice"::text AS "unitPrice", pi."totalPrice"::text AS "totalPrice" FROM "PurchaseOrderItem" pi JOIN "Food" f ON f."id" = pi."foodId" LEFT JOIN "Product" p ON p."id" = pi."productId" WHERE pi."purchaseOrderId" = ${id}::uuid AND pi."householdId" = ${householdId}::uuid ORDER BY pi."id"`;
    const items = rawItems.map((item) => ({ ...item, unitPrice: { amount: item.unitPrice, currency }, totalPrice: { amount: item.totalPrice, currency } }));
    return { ...orders[0], totalCost: { amount: orders[0].totalCost, currency }, currency, items };
  }

  private async getPurchaseOrderByItem(tx: Tx, householdId: string, itemId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT po."id", po."status"::text AS "status" FROM "PurchaseOrder" po JOIN "PurchaseOrderItem" pi ON pi."purchaseOrderId" = po."id" WHERE pi."id" = ${itemId}::uuid AND po."householdId" = ${householdId}::uuid`;
    if (!rows.length) throw new DomainError('PURCHASE_ORDER_NOT_FOUND', 'The purchase order does not exist.', 404);
    return rows[0];
  }
}

function validateKey(key: string): void { if (!key || key.length > 200) throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must contain 1 to 200 characters.'); }
function validateQuantity(value: string): void { if (!/^\d+(?:\.\d{1,3})?$/.test(value) || milli(value) <= 0n) throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive decimal with at most three decimal places.'); }
function validateMoney(value: string): void { if (!/^\d+(?:\.\d{1,4})?$/.test(value)) throw new DomainError('INVALID_MONEY', 'Money amounts must be nonnegative and have at most four decimal places.'); }
function normalizeDecimal(value: string): string { const [whole, fraction = ''] = value.split('.'); return `${whole}.${fraction.padEnd(3, '0')}`; }
function milli(value: string): bigint { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); }
function requestHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function assertReplay(actual: string, expected: string): void { if (actual.trim() !== expected) throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey was already used with a different request.', 422); }
function decodeCursor(cursor: string): string { const id = Buffer.from(cursor, 'base64url').toString(); if (Buffer.from(id).toString('base64url') !== cursor || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new DomainError('INVALID_CURSOR', 'The purchase order cursor is invalid.'); return id; }
function encodeCursor(id: string): string { return Buffer.from(id).toString('base64url'); }
