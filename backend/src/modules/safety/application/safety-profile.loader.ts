import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { SafetyProfileSnapshot } from '@/modules/safety/domain/safety-evaluator.js';

@Injectable()
export class SafetyProfileLoader {
  constructor(private readonly transactions: TransactionRunner) {}

  /** Deliberately excludes encrypted free-text notes and reads a complete snapshot in one SQL statement. */
  async load(userId: string): Promise<SafetyProfileSnapshot> {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ snapshot: SafetyProfileSnapshot }>>`
        SELECT jsonb_build_object(
          'allergyFoodIds', COALESCE((SELECT jsonb_agg("foodId"::text) FROM "UserAllergy" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'allergyCategoryIds', COALESCE((SELECT jsonb_agg("categoryId"::text) FROM "UserAllergyCategory" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'dislikedFoodIds', COALESCE((SELECT jsonb_agg("foodId"::text) FROM "UserDislikedFood" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'dislikedCategoryIds', COALESCE((SELECT jsonb_agg("categoryId"::text) FROM "UserDislikedCategory" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'dietaryPreferences', COALESCE((SELECT jsonb_agg("dietaryPreference"::text) FROM "UserDietaryPreference" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'healthConditions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'status', uhc."status"::text,
              'rules', COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'ruleType', r."ruleType"::text, 'targetType', r."targetType"::text,
                'foodId', r."foodId", 'categoryId', r."categoryId", 'nutrient', r."nutrient"::text,
                'maxPer100g', r."maxPer100g", 'maxPerDay', r."maxPerDay"
              ))) FROM "HealthConditionDietRule" r WHERE r."healthConditionId" = uhc."healthConditionId" AND r."isActive"), '[]'::jsonb)
            )) FROM "UserHealthCondition" uhc WHERE uhc."userId" = ${userId}::uuid AND uhc."status" <> 'RESOLVED'
          ), '[]'::jsonb),
          'dietaryRules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('dietaryPreference', r."dietaryPreference"::text,
              'rule', jsonb_strip_nulls(jsonb_build_object('ruleType', r."ruleType"::text,
                'targetType', r."targetType"::text, 'foodId', r."foodId", 'categoryId', r."categoryId"))))
            FROM "DietaryRule" r WHERE r."isActive"
          ), '[]'::jsonb)
        ) AS snapshot`;
      return rows[0].snapshot;
    }, { userId });
  }
}
