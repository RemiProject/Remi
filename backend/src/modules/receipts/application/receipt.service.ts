import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { StorageLocation } from '@/modules/inventory/storage-location.js';
import { Unit } from '@/shared/food-unit.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { InventoryLedgerService } from '@/modules/inventory/application/inventory-ledger.service.js';
import { matchConfidence, suggestedStorage } from '@/modules/receipts/domain/receipt-match.js';
import { bestStorage, shelfLifeDays, type ShelfLife } from '@/modules/inventory/domain/shelf-life.js';
import type { ReceiptFoodOptionType, ReceiptLineMatchType, ReceiveReceiptInput, ReceiveReceiptResultType } from '@/modules/receipts/presentation/receipt.types.js';
import { ReceiptMatchConfidence } from '@/modules/receipts/presentation/receipt.types.js';

type ScoreRow = { ord: number; foodId: string; wordScore: number; wholeScore: number };
type FoodRow = { id: string; name: string; arabicName: string | null; categoryCode: string; categoryName: string; defaultUnit: Unit; gramsPerPiece: string | null } & { [K in keyof ShelfLife]: ShelfLife[K] | null } & { hasShelfLife: boolean };
type StockRow = { foodId: string; unit: Unit; quantity: string };

export const MAX_RECEIPT_LINES = 80;

@Injectable()
export class ReceiptService {
  constructor(private readonly transactions: TransactionRunner, private readonly ledger: InventoryLedgerService) {}

  /**
   * Matches cleaned receipt item names to catalogue foods by trigram similarity against food names,
   * aliases (English and Arabic) and packaged product names. Each line gets its best food, up to three
   * alternatives, and what the kitchen already holds of it.
   */
  async match(householdId: string, userId: string, names: string[]): Promise<ReceiptLineMatchType[]> {
    if (names.length > MAX_RECEIPT_LINES) throw new DomainError('TOO_MANY_RECEIPT_LINES', `A receipt can have at most ${MAX_RECEIPT_LINES} lines.`, 422);
    const queries = names.map(name => name.trim().slice(0, 160));
    if (!queries.length) return [];
    return this.transactions.run(async tx => {
      const scores = await tx.$queryRaw<ScoreRow[]>`
        WITH q AS (
          SELECT t.ord::int AS ord, normalize_food_alias(t.query) AS norm FROM unnest(${queries}::text[]) WITH ORDINALITY AS t(query, ord)
        ), labels AS (
          SELECT f."id" AS "foodId", lower(f."name") AS label FROM "Food" f WHERE f."archivedAt" IS NULL
          UNION ALL
          SELECT a."foodId", a."aliasNormalized" FROM "FoodAlias" a JOIN "Food" f ON f."id" = a."foodId" WHERE f."archivedAt" IS NULL AND a."aliasNormalized" IS NOT NULL
          UNION ALL
          SELECT p."foodId", normalize_food_alias(CASE WHEN p."brand" IS NULL OR p."name" ILIKE '%' || p."brand" || '%' THEN p."name" ELSE p."brand" || ' ' || p."name" END)
          FROM "Product" p JOIN "Food" f ON f."id" = p."foodId" WHERE p."archivedAt" IS NULL AND f."archivedAt" IS NULL
        )
        SELECT q.ord, m."foodId", m."wordScore", m."wholeScore" FROM q CROSS JOIN LATERAL (
          SELECT l."foodId", max(strict_word_similarity(l.label, q.norm))::float8 AS "wordScore", max(similarity(l.label, q.norm))::float8 AS "wholeScore"
          FROM labels l WHERE q.norm <> '' AND strict_word_similarity(l.label, q.norm) >= 0.45
          GROUP BY l."foodId" ORDER BY 2 DESC, 3 DESC LIMIT 4
        ) m ORDER BY q.ord, m."wordScore" DESC, m."wholeScore" DESC`;
      const foodIds = [...new Set(scores.map(row => row.foodId))];
      const foods = foodIds.length ? await tx.$queryRaw<FoodRow[]>`
        SELECT f."id", f."name", ar."alias" AS "arabicName", c."code" AS "categoryCode", c."name" AS "categoryName", f."defaultUnit"::text AS "defaultUnit", f."gramsPerPiece"::text AS "gramsPerPiece",
          s."foodId" IS NOT NULL AS "hasShelfLife", s."roomMinDays", s."roomMaxDays", coalesce(s."ripensAtRoomTemp", false) AS "ripensAtRoomTemp", s."fridgeMinDays", s."fridgeMaxDays",
          s."freezerMinDays", s."freezerMaxDays", coalesce(s."freezeNotRecommended", false) AS "freezeNotRecommended"
        FROM "Food" f JOIN "FoodCategory" c ON c."id" = f."categoryId" LEFT JOIN "FoodShelfLife" s ON s."foodId" = f."id"
        LEFT JOIN LATERAL (SELECT a."alias" FROM "FoodAlias" a JOIN "Language" l ON l."id" = a."languageId" WHERE a."foodId" = f."id" AND l."code" = 'ar' ORDER BY a."isPrimary" DESC LIMIT 1) ar ON true
        WHERE f."id" = ANY(${foodIds}::uuid[])` : [];
      const stock = foodIds.length ? await tx.$queryRaw<StockRow[]>`
        SELECT "foodId", "unit"::text AS "unit", sum("quantity")::text AS "quantity" FROM "InventoryItem"
        WHERE "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL AND "quantity" > 0 AND "foodId" = ANY(${foodIds}::uuid[])
        GROUP BY "foodId", "unit" ORDER BY "foodId", sum("quantity") DESC` : [];
      const byId = new Map(foods.map(food => [food.id, food]));
      const option = (row: ScoreRow): ReceiptFoodOptionType => {
        const food = byId.get(row.foodId)!;
        const shelf = food.hasShelfLife ? food as ShelfLife : null;
        const keeps = (storage: string) => shelfLifeDays(shelf, storage)?.average ?? null;
        return { foodId: food.id, name: food.name, arabicName: food.arabicName, categoryCode: food.categoryCode, categoryName: food.categoryName,
          defaultUnit: food.defaultUnit, gramsPerPiece: food.gramsPerPiece,
          // USDA's figures pick the storage when Remi has them; otherwise the category rule does.
          storageLocation: (bestStorage(shelf) as StorageLocation | null) ?? suggestedStorage(food.categoryCode, food.name),
          keeps: shelf ? { counter: keeps('COUNTER'), fridge: keeps('FRIDGE'), freezer: keeps('FREEZER'), ripensAtRoomTemp: shelf.ripensAtRoomTemp } : null,
          score: Math.round(row.wordScore * 100) / 100 };
      };
      return queries.map((query, index) => {
        const rows = scores.filter(row => row.ord === index + 1);
        const best = rows[0];
        const confidence = best ? matchConfidence(best.wordScore, best.wholeScore) : 'NONE';
        const food = best && confidence !== 'NONE' ? option(best) : null;
        return {
          query, confidence: ReceiptMatchConfidence[confidence], food,
          alternatives: rows.slice(food ? 1 : 0).map(option),
          inKitchen: food ? stock.filter(row => row.foodId === food.foodId).map(row => ({ quantity: row.quantity, unit: row.unit })) : [],
        };
      });
    }, { householdId, userId, readOnly: true });
  }

  /** Adds every confirmed receipt line to the kitchen in one transaction. Retrying with the same key adds nothing twice. */
  async receive(householdId: string, userId: string, input: ReceiveReceiptInput): Promise<ReceiveReceiptResultType> {
    if (input.items.length > MAX_RECEIPT_LINES) throw new DomainError('TOO_MANY_RECEIPT_LINES', `A receipt can have at most ${MAX_RECEIPT_LINES} lines.`, 422);
    return this.transactions.run(async tx => {
      const results = [];
      for (const [index, item] of input.items.entries()) {
        results.push(await this.ledger.receiveWithinTransaction(tx, householdId, userId, {
          foodId: item.foodId, amount: item.amount, unit: item.unit, storageLocation: item.storageLocation,
          purchaseDate: input.purchaseDate, estimatedExpiryAt: item.estimatedExpiryAt,
          idempotencyKey: `receipt:${input.idempotencyKey}:${index}`,
        }));
      }
      return {
        added: results.filter(result => !result.replayed).length,
        replayed: results.every(result => result.replayed),
        items: results.map(result => ({ foodId: result.foodId, inventoryItemId: result.balances[0]!.inventoryItemId, quantity: result.quantity, unit: result.unit })),
      };
    }, { householdId, userId });
  }
}
