import { Inject, Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@/generated/client.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { SafetyEvaluator, type SafetyIngredient } from '@/modules/safety/domain/safety-evaluator.js';
import { SafetyProfileLoader } from '@/modules/safety/application/safety-profile.loader.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.js';
import { SearchDocumentSourceType } from './search.types.js';
import { serializeNormalizedEmbedding } from './embedding-vector.js';

interface SearchRow {
  id: string;
  sourceType: SearchDocumentSourceType;
  score: number;
  foodName: string | null;
  categoryName: string | null;
  defaultUnit: string | null;
  recipeName: string | null;
  description: string | null;
  mealName: string | null;
  eatenAt: Date | null;
  mealType: string | null;
}
interface SearchIngredientRow {
  sourceType: SearchDocumentSourceType;
  sourceId: string;
  foodId: string;
  categoryIds: string[];
  nutrientsPer100g: SafetyIngredient['nutrientsPer100g'];
}
type SafeSearchResult =
  | { __typename: 'SearchFoodResult'; id: string; name: string; categoryName: string; defaultUnit: string; safetyWarnings: string[]; score: number }
  | { __typename: 'SearchRecipeResult'; id: string; name: string; description: string | null; safetyWarnings: string[]; score: number }
  | { __typename: 'SearchMealResult'; id: string; name: string; eatenAt: Date; mealType: string; safetyWarnings: string[]; score: number };

@Injectable()
export class SearchService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly config: AppConfigService,
    private readonly safetyProfiles: SafetyProfileLoader,
    private readonly safetyEvaluator: SafetyEvaluator,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  async search(query: string, householdId: string, userId: string, types: SearchDocumentSourceType[] | undefined, first: number) {
    const normalized = query.trim().slice(0, 500);
    if (!normalized) return [];
    if (first < 1 || first > 20) throw new BadRequestException('first must be between 1 and 20');
    const model = this.config.env.EMBEDDING_MODEL;
    const vector = serializeNormalizedEmbedding(await this.embeddings.embed(normalized, 'query'));
    const limit = Math.max(1, Math.min(first, 20));
    const sourceTypes = types?.length ? types : Object.values(SearchDocumentSourceType);
    const safeRows = await this.transactions.run(async (tx) => {
      await tx.$executeRaw`SELECT safety_lock(ARRAY[${userId}::uuid])`;
      const profile = await this.safetyProfiles.loadInTransaction(tx, userId);
      await tx.$queryRaw`SELECT set_config('hnsw.ef_search', '80', true)`;
      await tx.$queryRaw`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`;
      const stale = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM "SearchDocument"
        WHERE "embeddingStatus" = 'READY' AND "isSearchable" AND "embeddingModel" IS DISTINCT FROM ${model}`;
      if (stale[0] && Number(stale[0].count) > 0) throw new ServiceUnavailableException('The search index is being rebuilt for a new embedding model');
      const rows = await tx.$queryRaw<SearchRow[]>(Prisma.sql`
        SELECT d."sourceId" AS id, d."sourceType",
          (1 - (d."embedding" <=> ${vector}::vector))::float8 AS score,
          f.name AS "foodName", c.name AS "categoryName", f."defaultUnit"::text AS "defaultUnit",
          r.name AS "recipeName", r.description,
          m.name AS "mealName", m."eatenAt", m."mealType"::text AS "mealType"
        FROM "SearchDocument" d
        LEFT JOIN "Food" f ON d."sourceType" = 'FOOD' AND f.id = d."sourceId" AND f."archivedAt" IS NULL
        LEFT JOIN "FoodCategory" c ON c.id = f."categoryId"
        LEFT JOIN "Recipe" r ON d."sourceType" = 'RECIPE' AND r.id = d."sourceId" AND r."archivedAt" IS NULL
        LEFT JOIN "Meal" m ON d."sourceType" = 'MEAL' AND m.id = d."sourceId" AND m."householdId" = d."householdId" AND m."userId" = d."userId"
        WHERE d."embeddingStatus" = 'READY'
          AND d."embedding" IS NOT NULL
          AND d."isSearchable" = true
          AND d."embeddingModel" = ${model}
          AND (d."householdId" IS NULL OR d."householdId" = ${householdId}::uuid)
          AND (d."userId" IS NULL OR d."userId" = ${userId}::uuid)
          AND d."sourceType"::text = ANY(${sourceTypes}::text[])
          AND (d."sourceType" <> 'FOOD' OR f.id IS NOT NULL)
          AND (d."sourceType" <> 'RECIPE' OR r.id IS NOT NULL)
          AND (d."sourceType" <> 'MEAL' OR m.id IS NOT NULL)
        ORDER BY d."embedding" <=> ${vector}::vector
        LIMIT ${limit}
      `);
      if (!rows.length) return [];
      const foodIds = rows.filter((row) => row.sourceType === SearchDocumentSourceType.FOOD).map((row) => row.id);
      const recipeIds = rows.filter((row) => row.sourceType === SearchDocumentSourceType.RECIPE).map((row) => row.id);
      const mealIds = rows.filter((row) => row.sourceType === SearchDocumentSourceType.MEAL).map((row) => row.id);
      const ingredientRows = await tx.$queryRaw<SearchIngredientRow[]>`
        WITH source_ingredients AS (
          SELECT 'FOOD'::text AS "sourceType", f.id AS "sourceId", f.id AS "foodId"
          FROM "Food" f WHERE f.id = ANY(${foodIds}::uuid[])
          UNION ALL
          SELECT 'RECIPE', i."recipeId", i."foodId" FROM "RecipeIngredient" i WHERE i."recipeId" = ANY(${recipeIds}::uuid[])
          UNION ALL
          SELECT 'MEAL', i."mealId", i."foodId" FROM "MealItem" i WHERE i."mealId" = ANY(${mealIds}::uuid[])
        )
        SELECT s."sourceType"::text AS "sourceType", s."sourceId"::text AS "sourceId",
          f.id::text AS "foodId", food_safety_category_ids(f.id)::text[] AS "categoryIds",
          jsonb_strip_nulls(jsonb_build_object(
            'CALORIES', n."caloriesPer100g", 'PROTEIN', n."proteinG", 'CARBS', n."carbsG",
            'FAT', n."fatG", 'FIBER', n."fiberG", 'SUGAR', n."sugarG", 'SODIUM', n."sodiumMg"
          )) AS "nutrientsPer100g"
        FROM source_ingredients s JOIN "Food" f ON f.id = s."foodId"
        LEFT JOIN "NutritionProfile" n ON n."foodId" = f.id`;
      const bySource = new Map<string, SafetyIngredient[]>();
      for (const ingredient of ingredientRows) {
        const key = `${ingredient.sourceType}:${ingredient.sourceId}`;
        const items = bySource.get(key) ?? [];
        items.push({ foodId: ingredient.foodId, categoryIds: ingredient.categoryIds, nutrientsPer100g: ingredient.nutrientsPer100g ?? {} });
        bySource.set(key, items);
      }
      const safeResults: SafeSearchResult[] = [];
      for (const row of rows) {
        const ingredients = bySource.get(`${row.sourceType}:${row.id}`) ?? [];
        // Recipe and meal results without ingredient data cannot pass the fail-closed safety gate.
        if (row.sourceType !== SearchDocumentSourceType.FOOD && ingredients.length === 0) continue;
        const verdicts = this.safetyEvaluator.evaluate(profile, ingredients);
        if (verdicts.some((verdict) => verdict.result === 'FAILED')) continue;
        const safetyWarnings = verdicts.filter((verdict) => verdict.result === 'WARNED').map((verdict) => verdict.filterType);
        if (row.sourceType === SearchDocumentSourceType.FOOD) safeResults.push({ __typename: 'SearchFoodResult', id: row.id, name: row.foodName!, categoryName: row.categoryName!, defaultUnit: row.defaultUnit!, safetyWarnings, score: row.score });
        else if (row.sourceType === SearchDocumentSourceType.RECIPE) safeResults.push({ __typename: 'SearchRecipeResult', id: row.id, name: row.recipeName!, description: row.description, safetyWarnings, score: row.score });
        else safeResults.push({ __typename: 'SearchMealResult', id: row.id, name: row.mealName!, eatenAt: row.eatenAt!, mealType: row.mealType!, safetyWarnings, score: row.score });
      }
      return safeResults;
    }, { householdId, userId });
    return safeRows;
  }
}
