import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { convertQuantity } from '@/modules/units/domain/unit-converter.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { buildInputHash } from '@/modules/predictions/domain/input-hash.js';
import { evaluateFreshness, type FreshnessSample } from '@/modules/predictions/domain/freshness-policy.js';

const MODEL_VERSION = 'depletion-v1';
const LOOKBACK_DAYS = 30;
const PREDICTION_TTL_DAYS = 7;

type Batch = { id: string; foodId: string; foodName: string; quantity: string; unit: Unit; version: number; defaultUnit: Unit; densityGPerMl: string | null; gramsPerPiece: string | null };
type Consumption = { id: string; foodId: string; amount: string; unit: Unit; defaultUnit: Unit; densityGPerMl: string | null; gramsPerPiece: string | null };

@Injectable()
export class PredictionService {
  constructor(private readonly transactions: TransactionRunner, private readonly config: AppConfigService) {}

  async generateFoodDepletion(householdId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const locks = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended('prediction:' || ${householdId} || ':FOOD_DEPLETION', 0)) AS acquired`;
      if (!locks[0]?.acquired) return;

      const batches = await tx.$queryRaw<Batch[]>`
        SELECT i."id", i."foodId", f."name" AS "foodName", i."quantity"::text AS "quantity", i."unit"::text AS "unit", i."version",
               f."defaultUnit"::text AS "defaultUnit", f."densityGPerMl"::text AS "densityGPerMl", f."gramsPerPiece"::text AS "gramsPerPiece"
        FROM "InventoryItem" i JOIN "Food" f ON f."id" = i."foodId"
        WHERE i."householdId" = ${householdId}::uuid AND i."archivedAt" IS NULL AND i."quantity" > 0
        ORDER BY i."foodId", i."id"`;
      const consumption = await tx.$queryRaw<Consumption[]>`
        SELECT t."id", e."foodId", abs(t."quantityDelta")::text AS "amount", i."unit"::text AS "unit",
               f."defaultUnit"::text AS "defaultUnit", f."densityGPerMl"::text AS "densityGPerMl", f."gramsPerPiece"::text AS "gramsPerPiece"
        FROM "InventoryTransaction" t
        JOIN "InventoryItem" i ON i."id" = t."inventoryItemId" AND i."householdId" = t."householdId"
        JOIN "FoodEvent" e ON e."id" = t."foodEventId" AND e."householdId" = t."householdId"
        JOIN "Food" f ON f."id" = e."foodId"
        WHERE t."householdId" = ${householdId}::uuid AND t."createdAt" >= now() - interval '30 days'
          AND t."movementType" IN ('CONSUMPTION', 'COOKED')
        ORDER BY e."foodId", t."createdAt", t."id"`;

      const stockByFood = new Map<string, { rows: Batch[]; quantity: number }>();
      for (const batch of batches) {
        const group = stockByFood.get(batch.foodId) ?? { rows: [], quantity: 0 };
        group.rows.push(batch);
        group.quantity += Number(convertQuantity(batch.quantity, batch.unit, batch.defaultUnit, batch));
        stockByFood.set(batch.foodId, group);
      }
      const useByFood = new Map<string, { rows: Consumption[]; amount: number; unit: Unit; factors: { densityGPerMl: string | null; gramsPerPiece: string | null } }>();
      for (const row of consumption) {
        const group = useByFood.get(row.foodId) ?? { rows: [], amount: 0, unit: row.defaultUnit, factors: row };
        group.rows.push(row);
        group.amount += Number(convertQuantity(row.amount, row.unit, row.defaultUnit, row));
        useByFood.set(row.foodId, group);
      }

      const foods = [...stockByFood.entries()].sort(([a], [b]) => a.localeCompare(b));
      for (const [foodId, stock] of foods) {
        const use = useByFood.get(foodId);
        if (!use || use.amount <= 0 || stock.quantity <= 0) {
          await tx.$executeRaw`UPDATE "AIPrediction" SET "expiresAt" = now() WHERE "householdId" = ${householdId}::uuid AND "predictionType" = 'FOOD_DEPLETION' AND "expiresAt" > now() AND "id" IN (SELECT "predictionId" FROM "AIFoodDepletionPrediction" WHERE "foodId" = ${foodId}::uuid AND "householdId" = ${householdId}::uuid)`;
          continue;
        }
        const avgDailyQty = use.amount / LOOKBACK_DAYS;
        const daysLeft = stock.quantity / avgDailyQty;
        const inputHash = buildInputHash({ type: 'FOOD_DEPLETION', userId: null, model: MODEL_VERSION, windowDays: LOOKBACK_DAYS, foodId,
          stock: stock.rows.map((row) => [row.id, row.quantity, row.unit, row.version]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          consumption: use.rows.map((row) => [row.id, row.amount, row.unit]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
        await tx.$executeRaw`UPDATE "AIPrediction" SET "expiresAt" = now() WHERE "householdId" = ${householdId}::uuid AND "predictionType" = 'FOOD_DEPLETION' AND "expiresAt" > now() AND "id" IN (SELECT "predictionId" FROM "AIFoodDepletionPrediction" WHERE "foodId" = ${foodId}::uuid AND "householdId" = ${householdId}::uuid) AND "inputHash" <> ${inputHash}`;
        const predictionId = newId();
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO "AIPrediction" ("id", "householdId", "predictionType", "confidence", "modelVersion", "inputHash", "expiresAt") VALUES (${predictionId}::uuid, ${householdId}::uuid, 'FOOD_DEPLETION', 0.750, ${MODEL_VERSION}, ${inputHash}, now() + (${PREDICTION_TTL_DAYS} * interval '1 day')) ON CONFLICT ("householdId", "predictionType", "userId", "inputHash") DO NOTHING RETURNING "id"`;
        const finalId = inserted[0]?.id ?? (await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AIPrediction" WHERE "householdId" = ${householdId}::uuid AND "predictionType" = 'FOOD_DEPLETION' AND "userId" IS NULL AND "inputHash" = ${inputHash}`)[0]?.id;
        if (!finalId) throw new Error('Prediction upsert did not return an id.');
        if (inserted.length) {
          await tx.$executeRaw`INSERT INTO "AIFoodDepletionPrediction" ("predictionId", "householdId", "foodId", "currentQty", "unit", "avgDailyQty", "daysLeft", "runOutAt") VALUES (${finalId}::uuid, ${householdId}::uuid, ${foodId}::uuid, ${stock.quantity.toFixed(3)}::numeric, ${use.unit}::"Unit", ${avgDailyQty.toFixed(3)}::numeric, ${daysLeft.toFixed(2)}::numeric, now() + (${daysLeft} * interval '1 day'))`;
        }
      }
    }, { householdId });
  }

  async recomputeFreshness(householdId: string, inventoryItemId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<FreshnessSample & { inventoryItemId: string; householdId: string; predictedAt: Date; qualityScore: string; confidence: string }>>`
        SELECT "id", "inventoryItemId", "householdId", "qualityScore"::text AS "qualityScore", "confidence"::text AS "confidence", "predictedAt", "remainingQualityHours"
        FROM "FreshnessPrediction" WHERE "inventoryItemId" = ${inventoryItemId}::uuid AND "householdId" = ${householdId}::uuid
          ORDER BY "predictedAt" DESC, "id" DESC`;
      const score = evaluateFreshness(rows.map((row) => ({ ...row, qualityScore: Number(row.qualityScore), confidence: Number(row.confidence) })), new Date(), this.config.env.FRESHNESS_MIN_CONFIDENCE);
      await tx.$executeRaw`UPDATE "InventoryItem" SET "freshnessScore" = ${score}::numeric, "updatedAt" = now() WHERE "id" = ${inventoryItemId}::uuid AND "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL AND "freshnessScore" IS DISTINCT FROM ${score}::numeric`;
      const cached = await tx.$queryRaw<Array<{ freshnessScore: string | null }>>`SELECT "freshnessScore"::text AS "freshnessScore" FROM "InventoryItem" WHERE "id" = ${inventoryItemId}::uuid AND "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL`;
      if (cached.length && cached[0].freshnessScore !== (score === null ? null : score.toFixed(3))) throw new Error('Freshness cache did not match the current policy result.');
    }, { householdId });
  }

  async refreshExpiredFreshness(): Promise<number> {
    const threshold = this.config.env.FRESHNESS_MIN_CONFIDENCE;
    const items = await this.transactions.run((tx) => tx.$queryRaw<Array<{ householdId: string; id: string }>>`
      SELECT i."householdId", i."id" FROM "InventoryItem" i
      WHERE i."archivedAt" IS NULL AND i."freshnessScore" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "FreshnessPrediction" f WHERE f."inventoryItemId" = i."id" AND f."householdId" = i."householdId"
          AND f."confidence" >= ${threshold} AND f."predictedAt" + make_interval(hours => f."remainingQualityHours") > now())
      ORDER BY i."updatedAt", i."id" LIMIT 500`);
    for (const item of items) await this.recomputeFreshness(item.householdId, item.id);
    return items.length;
  }

  async purgeExpired(): Promise<number> {
    return this.transactions.run(async (tx) => tx.$executeRaw`WITH expired AS (SELECT "id" FROM "AIPrediction" WHERE "expiresAt" <= now() ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED) DELETE FROM "AIPrediction" p USING expired e WHERE p."id" = e."id"`);
  }
}
