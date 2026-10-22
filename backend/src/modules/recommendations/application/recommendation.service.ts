import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { newId } from '@/shared/ids.js';
import { DomainError } from '@/shared/domain-error.js';
import { buildInputHash } from '@/modules/predictions/domain/input-hash.js';
import { SafetyEvaluator, SAFETY_FILTERS, type SafetyProfileSnapshot } from '@/modules/safety/domain/safety-evaluator.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { NotificationFactory } from '@/modules/notifications/application/notification.factory.js';

const MODEL = 'supply-need-v1';
const FILTER_ENUM: Record<(typeof SAFETY_FILTERS)[number], string> = Object.fromEntries(SAFETY_FILTERS.map((filter) => [filter, filter])) as Record<(typeof SAFETY_FILTERS)[number], string>;

@Injectable()
export class RecommendationService {
  constructor(private readonly transactions: TransactionRunner, private readonly evaluator: SafetyEvaluator, private readonly notifications: NotificationFactory) {}

  async generate(householdId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const members = await tx.$queryRaw<Array<{ userId: string }>>`SELECT "userId" FROM "HouseholdMember" WHERE "householdId" = ${householdId}::uuid AND "leftAt" IS NULL ORDER BY "userId"`;
      const forecasts = await tx.$queryRaw<Array<{ predictionId: string; inputHash: string; foodId: string; foodName: string; daysLeft: number; quantity: string; unit: string; defaultUnit: string; categories: string[]; nutrients: Record<string, number> }>>`
        SELECT p.id AS "predictionId", p."inputHash", d."foodId", f.name AS "foodName", d."daysLeft"::float8 AS "daysLeft",
          d."currentQty"::text AS quantity, d.unit::text AS unit, f."defaultUnit"::text AS "defaultUnit",
          ARRAY[f."categoryId"::text] AS categories,
          jsonb_strip_nulls(jsonb_build_object('CALORIES', n."caloriesPer100g", 'PROTEIN', n."proteinG", 'CARBS', n."carbsG", 'FAT', n."fatG", 'FIBER', n."fiberG", 'SUGAR', n."sugarG", 'SODIUM', n."sodiumMg")) AS nutrients
        FROM "AIPrediction" p JOIN "AIFoodDepletionPrediction" d ON d."predictionId" = p.id
        JOIN "Food" f ON f.id = d."foodId" LEFT JOIN "NutritionProfile" n ON n."foodId" = f.id
        WHERE p."householdId" = ${householdId}::uuid AND p."predictionType" = 'FOOD_DEPLETION' AND p."expiresAt" > now() AND d."daysLeft" <= 14
        ORDER BY d."daysLeft", d."foodId"`;
      for (const member of members) {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${member.userId}, true)`;
        await tx.$queryRaw`SELECT safety_lock(ARRAY[${member.userId}::uuid])`;
        const profile = await this.loadProfile(tx, member.userId);
        const safetyHash = buildInputHash(profile);
        for (const forecast of forecasts) {
          const inputHash = buildInputHash({ type: 'SUPPLY_NEED', userId: member.userId, safetyHash, predictionHash: forecast.inputHash, foodId: forecast.foodId, model: MODEL });
          await tx.$executeRaw`UPDATE "AIRecommendation" r SET status = 'EXPIRED', "statusChangedAt" = now()
            WHERE r."householdId" = ${householdId}::uuid AND r."userId" = ${member.userId}::uuid AND r.type = 'SUPPLY_NEED' AND r.status = 'DRAFT' AND r."inputHash" <> ${inputHash}
              AND EXISTS (SELECT 1 FROM "AIShoppingRecommendation" d WHERE d."recommendationId" = r.id AND d."foodId" = ${forecast.foodId}::uuid)`;
          const recommendationId = newId();
          const inserted = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO "AIRecommendation" (id, "householdId", "userId", type, status, "safetyStatus", summary, "modelVersion", "inputHash", "sourcePredictionId", "expiresAt")
            VALUES (${recommendationId}::uuid, ${householdId}::uuid, ${member.userId}::uuid, 'SUPPLY_NEED', 'DRAFT', 'PENDING', ${`Consider replenishing ${forecast.foodName}; current stock may last ${Math.max(0, forecast.daysLeft).toFixed(1)} days.`}, ${MODEL}, ${inputHash}, ${forecast.predictionId}::uuid, now() + interval '7 days')
            ON CONFLICT ("householdId", type, "userId", "inputHash") DO NOTHING RETURNING id`;
          if (!inserted.length) continue;
          await tx.$executeRaw`INSERT INTO "AIShoppingRecommendation" ("recommendationId", "householdId", "recommendationType", "foodId", "suggestedQty", unit, priority)
            VALUES (${recommendationId}::uuid, ${householdId}::uuid, 'SUPPLY_NEED', ${forecast.foodId}::uuid, ${forecast.quantity}::numeric, ${forecast.unit}::"Unit", ${forecast.daysLeft <= 3 ? 'HIGH' : forecast.daysLeft <= 7 ? 'NORMAL' : 'LOW'})`;
          await tx.$executeRaw`INSERT INTO "OutboxEvent" ("householdId", topic, "dedupeKey", payload, "nextAttemptAt")
            VALUES (${householdId}::uuid, 'recommendation.safety.requested', ${recommendationId}, jsonb_build_object('recommendationId', ${recommendationId}::text, 'householdId', ${householdId}::text), now())
            ON CONFLICT (topic, "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING`;
        }
      }
    }, { householdId });
  }

  async runSafety(recommendationId: string, householdId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const owner = await tx.$queryRaw<Array<{ userId: string }>>`SELECT recommendation_safety_owner(${recommendationId}::uuid, ${householdId}::uuid) AS "userId"`;
      if (!owner[0]?.userId) return;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${owner[0].userId}, true)`;
      const rows = await tx.$queryRaw<Array<{ id: string; userId: string; foodId: string; foodName: string; categories: string[]; nutrients: Record<string, number> }>>`
        SELECT r.id, r."userId", d."foodId", f.name AS "foodName",
          ARRAY[f."categoryId"::text] AS categories,
          jsonb_strip_nulls(jsonb_build_object('CALORIES', n."caloriesPer100g", 'PROTEIN', n."proteinG", 'CARBS', n."carbsG", 'FAT', n."fatG", 'FIBER', n."fiberG", 'SUGAR', n."sugarG", 'SODIUM', n."sodiumMg")) AS nutrients
        FROM "AIRecommendation" r JOIN "AIShoppingRecommendation" d ON d."recommendationId" = r.id
        JOIN "Food" f ON f.id = d."foodId" LEFT JOIN "NutritionProfile" n ON n."foodId" = f.id WHERE r.id = ${recommendationId}::uuid AND r."householdId" = ${householdId}::uuid AND r.status = 'DRAFT' AND r."safetyStatus" = 'PENDING'`;
      const row = rows[0];
      if (!row?.userId) return;
      await tx.$queryRaw`SELECT safety_lock(ARRAY[${row.userId}::uuid])`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${row.userId}, true)`;
      // Re-read after taking the shared safety lock; never use a snapshot captured before the lock.
      const stillOpen = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "AIRecommendation" WHERE id = ${recommendationId}::uuid AND status = 'DRAFT' AND "safetyStatus" = 'PENDING'`;
      if (!stillOpen.length) return;
      const profile = await this.loadProfile(tx, row.userId);
      const verdicts = this.evaluator.evaluate(profile, [{ foodId: row.foodId, categoryIds: row.categories, nutrientsPer100g: row.nutrients }]);
      await tx.$executeRaw`DELETE FROM "AIRecommendationSafetyCheck" WHERE "recommendationId" = ${recommendationId}::uuid`;
      for (const verdict of verdicts) {
        if (verdict.result === 'PASSED') {
          await tx.$executeRaw`INSERT INTO "AIRecommendationSafetyCheck" (id, "recommendationId", "filterType", result) VALUES (${newId()}::uuid, ${recommendationId}::uuid, ${FILTER_ENUM[verdict.filterType]}::"SafetyFilterType", 'PASSED')`;
        } else {
          await tx.$executeRaw`INSERT INTO "AIRecommendationSafetyCheck" (id, "recommendationId", "filterType", result, "blockedFoodId") VALUES (${newId()}::uuid, ${recommendationId}::uuid, ${FILTER_ENUM[verdict.filterType]}::"SafetyFilterType", ${verdict.result}::"SafetyCheckResult", ${row.foodId}::uuid)`;
        }
      }
      const blocked = verdicts.some((verdict) => verdict.result === 'FAILED');
      await tx.$executeRaw`UPDATE "AIRecommendation" SET "safetyStatus" = ${blocked ? 'BLOCKED' : 'PASSED'}::"SafetyStatus", status = ${blocked ? 'DRAFT' : 'ACTIVE'}::"RecommendationStatus" WHERE id = ${recommendationId}::uuid AND "householdId" = ${householdId}::uuid`;
      if (!blocked) await this.notifications.create(tx, { householdId, userId: row.userId, type: 'RECOMMENDATION_READY', dedupeKey: `recommendation:${recommendationId}` });
    }, { householdId });
  }

  async householdsForUser(userId: string): Promise<string[]> {
    const rows = await this.transactions.run((tx) => tx.$queryRaw<Array<{ householdId: string }>>`SELECT "householdId" FROM "HouseholdMember" WHERE "userId" = ${userId}::uuid AND "leftAt" IS NULL ORDER BY "householdId"`, { userId });
    return rows.map((row) => row.householdId);
  }

  async recheckUser(householdId: string, userId: string): Promise<void> {
    const rows = await this.transactions.run((tx) => tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "AIRecommendation" WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid AND status = 'DRAFT' AND "safetyStatus" = 'PENDING' ORDER BY id`, { householdId, userId });
    for (const row of rows) await this.runSafety(row.id, householdId);
  }

  async visible(householdId: string, userId: string, first: number, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const take = Math.min(Math.max(first, 1), 50);
    const cursor = after ? decodeRecommendationCursor(after) : null;
    const rows = await this.transactions.run((tx) => tx.$queryRaw<Array<{ id: string; summary: string | null; generatedAt: Date; expiresAt: Date; foodId: string; foodName: string; suggestedQty: string; unit: string; priority: string }>>`
      SELECT r.id, r.summary, r."generatedAt", r."expiresAt", f.id AS "foodId", f.name AS "foodName", d."suggestedQty"::text AS "suggestedQty", d.unit::text AS unit, d.priority
      FROM "AIRecommendation" r JOIN "AIShoppingRecommendation" d ON d."recommendationId" = r.id JOIN "Food" f ON f.id = d."foodId"
      WHERE r."householdId" = ${householdId}::uuid AND r."userId" = ${userId}::uuid AND r.type = 'SUPPLY_NEED' AND r.status = 'ACTIVE' AND r."safetyStatus" = 'PASSED' AND r."expiresAt" > now()
        AND (${cursor?.generatedAt ?? null}::timestamptz IS NULL OR (r."generatedAt", r.id) < (${cursor?.generatedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
      ORDER BY r."generatedAt" DESC, r.id DESC LIMIT ${take + 1}`, { householdId, userId });
    const hasNextPage = rows.length > take;
    const items = rows.slice(0, take);
    return { nodes: items, pageInfo: { hasNextPage, endCursor: items.length ? encodeRecommendationCursor(items[items.length - 1]) : null } };
  }

  async respond(householdId: string, userId: string, id: string, action: 'ACCEPTED' | 'DISMISSED') {
    const rows = await this.transactions.run(async (tx) => tx.$queryRaw<Array<{ id: string }>>`UPDATE "AIRecommendation" SET status = ${action}::"RecommendationStatus" WHERE id = ${id}::uuid AND "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid AND status = 'ACTIVE' AND "safetyStatus" = 'PASSED' RETURNING id`, { householdId, userId });
    if (!rows.length) throw new DomainError('RECOMMENDATION_NOT_AVAILABLE', 'Recommendation is not available to this user.', 404);
    return true;
  }

  async regenerate(householdId: string, userId: string): Promise<boolean> {
    await this.transactions.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO "OutboxEvent" ("householdId", topic, "dedupeKey", payload, "nextAttemptAt")
        VALUES (${householdId}::uuid, 'recommendation.generate.requested', ${householdId + ':' + userId + ':SUPPLY_NEED'}, jsonb_build_object('householdId', ${householdId}::text), now() + interval '5 minutes')
        ON CONFLICT (topic, "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING`;
    }, { householdId, userId });
    return true;
  }

  async expireBatch(): Promise<number> {
    const rows = await this.transactions.db.$queryRaw<Array<{ count: number }>>`SELECT recommendation_expire_batch(500) AS count`;
    return Number(rows[0]?.count ?? 0);
  }

  async foldFeedbackBatch(): Promise<number> {
    return this.transactions.run(async (tx) => {
      const feedback = await tx.$queryRaw<Array<{ id: string; userId: string; foodId: string; householdId: string; status: 'ACCEPTED' | 'DISMISSED' }>>`SELECT * FROM recommendation_feedback_claim(500)`;
      for (const row of feedback) {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${row.userId}, true), set_config('app.household_id', ${row.householdId}, true)`;
        const delta = row.status === 'ACCEPTED' ? 0.05 : -0.05;
        await tx.$executeRaw`INSERT INTO "UserFoodPreference" (id, "userId", "foodId", frequency, "preferenceScore")
          VALUES (${newId()}::uuid, ${row.userId}::uuid, ${row.foodId}::uuid, ${row.status === 'ACCEPTED' ? 1 : 0}, ${delta}::numeric)
          ON CONFLICT ("userId", "foodId") DO UPDATE SET frequency = "UserFoodPreference".frequency + EXCLUDED.frequency,
            "preferenceScore" = LEAST(1, GREATEST(-1, "UserFoodPreference"."preferenceScore" + EXCLUDED."preferenceScore")), "updatedAt" = now()`;
        await tx.$executeRaw`UPDATE "AIRecommendation" SET "feedbackFoldedAt" = now() WHERE id = ${row.id}::uuid AND "feedbackFoldedAt" IS NULL`;
      }
      return feedback.length;
    });
  }

  private async loadProfile(tx: Tx, userId: string): Promise<SafetyProfileSnapshot> {
    const rows = await tx.$queryRaw<Array<{ snapshot: SafetyProfileSnapshot }>>`SELECT jsonb_build_object(
      'allergyFoodIds', COALESCE((SELECT jsonb_agg("foodId"::text ORDER BY "foodId") FROM "UserAllergy" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
      'allergyCategoryIds', COALESCE((SELECT jsonb_agg("categoryId"::text ORDER BY "categoryId") FROM "UserAllergyCategory" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
      'dislikedFoodIds', COALESCE((SELECT jsonb_agg("foodId"::text ORDER BY "foodId") FROM "UserDislikedFood" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
      'dislikedCategoryIds', COALESCE((SELECT jsonb_agg("categoryId"::text ORDER BY "categoryId") FROM "UserDislikedCategory" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
      'dietaryPreferences', COALESCE((SELECT jsonb_agg("dietaryPreference"::text ORDER BY "dietaryPreference") FROM "UserDietaryPreference" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
      'healthConditions', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', uhc.status::text, 'rules', COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('ruleType', r."ruleType"::text, 'targetType', r."targetType"::text, 'foodId', r."foodId", 'categoryId', r."categoryId", 'nutrient', r.nutrient::text, 'maxPer100g', r."maxPer100g")) ORDER BY r."ruleType", r."targetType", r."foodId", r."categoryId", r.nutrient) FROM "HealthConditionDietRule" r WHERE r."healthConditionId" = uhc."healthConditionId" AND r."isActive"), '[]'::jsonb)) ORDER BY uhc."healthConditionId") FROM "UserHealthCondition" uhc WHERE uhc."userId" = ${userId}::uuid AND uhc.status <> 'RESOLVED'), '[]'::jsonb),
      'dietaryRules', COALESCE((SELECT jsonb_agg(jsonb_build_object('dietaryPreference', r."dietaryPreference"::text, 'rule', jsonb_strip_nulls(jsonb_build_object('ruleType', r."ruleType"::text, 'targetType', r."targetType"::text, 'foodId', r."foodId", 'categoryId', r."categoryId"))) ORDER BY r."dietaryPreference", r."ruleType", r."targetType", r."foodId", r."categoryId") FROM "DietaryRule" r WHERE r."isActive"), '[]'::jsonb)
    ) AS snapshot`;
    return rows[0].snapshot;
  }
}

function encodeRecommendationCursor(row: { id: string; generatedAt: Date }): string {
  return Buffer.from(JSON.stringify({ id: row.id, generatedAt: row.generatedAt.toISOString() })).toString('base64url');
}

function decodeRecommendationCursor(value: string): { id: string; generatedAt: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString();
    const cursor = JSON.parse(decoded) as { id?: string; generatedAt?: string };
    if (Buffer.from(decoded).toString('base64url') !== value || !cursor.id || !/^[0-9a-f-]{36}$/i.test(cursor.id) || !cursor.generatedAt || Number.isNaN(Date.parse(cursor.generatedAt))) throw new Error();
    return { id: cursor.id, generatedAt: cursor.generatedAt };
  } catch { throw new DomainError('INVALID_CURSOR', 'The recommendation cursor is invalid.'); }
}
