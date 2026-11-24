import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { DomainError } from '@/shared/domain-error.js';
import { SafetyEvaluator, SafetyProfileLoader, type SafetyIngredient } from '@/modules/safety/safety.public.js';
import { ASSUMED_STAPLE_NAMES, resolveAssumedStaples } from '@/modules/recipes/domain/assumed-staples.js';
import { matchAndRankRecipes, type IngredientMatch, type MatchingBatch, type MatchingIngredient, type MatchingRecipe } from '@/modules/recipes/domain/recipe-matcher.js';
import { loadRecipeNutrition } from './recipe-nutrition.loader.js';

export type SuggestionAlias = { id: string; alias: string; isPrimary: boolean; languageCode: string };
export type SuggestionFood = { foodId: string; foodName: string; aliases: SuggestionAlias[] };
export type SuggestionIngredient = SuggestionFood & IngredientMatch;
export type RecipeSummary = Omit<MatchingRecipe, 'ingredients'> & {
  householdId: string | null; description: string | null; cuisineId: string | null; cuisineName: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
};
type IngredientRow = MatchingIngredient & SafetyIngredient & { recipeId: string; archivedAt: Date | null };
type FoodRow = { id: string; name: string; aliases: SuggestionAlias[] };
export interface RecipeSuggestion {
  recipe: RecipeSummary;
  coverageRatio: number;
  haveCount: number;
  requiredCount: number;
  missing: SuggestionIngredient[];
  expired: SuggestionIngredient[];
  short: SuggestionIngredient[];
  unknown: SuggestionIngredient[];
  assumedStaples: SuggestionIngredient[];
  optional: SuggestionIngredient[];
  expiringSoon: (SuggestionFood & { expiryDay: string })[];
  safetyWarnings: string[];
}
export interface RecipeSuggestionsConnection {
  nodes: RecipeSuggestion[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalCount: number;
  missingStapleNames: string[];
}

const CACHE_TTL_MS = 5 * 60_000, CACHE_MAX = 500;

@Injectable()
export class RecipeSuggestionsService {
  /** Ranked suggestions per household and person, reused while nothing they depend on has changed (the `state` query in `list`). */
  private readonly cache = new Map<string, { state: string; at: number; nodes: RecipeSuggestion[]; missingStapleNames: string[] }>();

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: SafetyProfileLoader,
    private readonly safety: SafetyEvaluator,
  ) {}

  async list(householdId: string, userId: string, first = 20, after?: string | null): Promise<RecipeSuggestionsConnection> {
    if (!Number.isInteger(first) || first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const cursor = after == null ? null : decodeCursor(after);
    return this.transactions.run(async (tx) => {
      // Same safety lock/profile loader as Search. No saved records means empty lists, not an error.
      await tx.$executeRaw`SELECT safety_lock(ARRAY[${userId}::uuid])`;
      const profile = await this.profiles.loadInTransaction(tx, userId);
      const households = await tx.$queryRaw<Array<{ timezone: string }>>`
        SELECT timezone FROM "Household" WHERE id = ${householdId}::uuid AND "deletedAt" IS NULL`;
      if (!households.length) throw new DomainError('HOUSEHOLD_NOT_FOUND', 'The household no longer exists.', 404);
      const timezone = households[0].timezone;
      const now = new Date();
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      // Everything the ranking reads: the kitchen, the recipes and their ingredients, the catalogue, the person's safety profile, the day.
      const [{ state }] = await tx.$queryRaw<[{ state: string }]>`
        SELECT concat_ws('|', ${day}::text,
          (SELECT concat(count(*), '/', max("updatedAt"), '/', sum(version)) FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL),
          (SELECT concat(count(*), '/', max("updatedAt")) FROM "Recipe" WHERE "householdId" IS NULL OR "householdId" = ${householdId}::uuid),
          (SELECT count(*) FROM "RecipeIngredient"), (SELECT concat(count(*), '/', max("updatedAt")) FROM "Food"),
          (SELECT count(*) FROM "UserSafetyProfileEvent" WHERE "userId" = ${userId}::uuid)) AS state`;
      const cacheKey = `${householdId}:${userId}`;
      const hit = this.cache.get(cacheKey);
      const fresh = hit && hit.state === state && Date.now() - hit.at < CACHE_TTL_MS
        ? hit : { state, at: Date.now(), ...await this.rank(tx, householdId, timezone, now, profile) };
      if (fresh !== hit) {
        this.cache.delete(cacheKey);
        if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(cacheKey, fresh);
      }
      const { nodes } = fresh, staples = { missingNames: fresh.missingStapleNames };
      // Includes every returned value, owner scope, and local day; unaffected by seconds ticking between pages.
      const fingerprint = createHash('sha256').update(JSON.stringify({ userId, householdId, timezone, day, nodes, missingStaples: staples.missingNames })).digest('hex');
      if (cursor && cursor.fingerprint !== fingerprint) throw new DomainError('STALE_RECIPE_SUGGESTIONS_CURSOR', 'Recipe suggestions changed. Restart from the first page.');
      const offset = cursor ? nodes.findIndex(n => n.recipe.id === cursor.id) + 1 : 0;
      if (cursor && offset === 0) throw new DomainError('INVALID_CURSOR', 'The recipe suggestion cursor does not identify a result.');
      const page = nodes.slice(offset, offset + first);
      // Added after the fingerprint so nutrition never invalidates a cursor.
      const nutrition = await loadRecipeNutrition(tx, page.map(n => n.recipe.id));
      return {
        nodes: page.map(n => ({ ...n, recipe: { ...n.recipe, nutrition: nutrition.get(n.recipe.id) ?? null } })), totalCount: nodes.length, hasNextPage: offset + page.length < nodes.length,
        endCursor: page.length ? Buffer.from(JSON.stringify({ v: 1, fingerprint, id: page[page.length - 1].recipe.id })).toString('base64url') : null,
        missingStapleNames: staples.missingNames,
      };
    }, { householdId, userId, readOnly: true });
  }

  private async rank(tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0], householdId: string, timezone: string, now: Date,
    profile: Awaited<ReturnType<SafetyProfileLoader['loadInTransaction']>>): Promise<{ nodes: RecipeSuggestion[]; missingStapleNames: string[] }> {
      const recipes = await tx.$queryRaw<RecipeSummary[]>`
        SELECT r.id, r."householdId", r.name, r.description, r.servings, r."prepTimeMin", r."cookTimeMin",
          r.difficulty::text AS difficulty, r."cuisineId", c.name AS "cuisineName"
        FROM "Recipe" r LEFT JOIN "Cuisine" c ON c.id = r."cuisineId"
        WHERE r."archivedAt" IS NULL AND (r."householdId" IS NULL OR r."householdId" = ${householdId}::uuid)
        ORDER BY r.id`;
      const ingredients = await tx.$queryRaw<IngredientRow[]>`
        SELECT i."recipeId", i."foodId", i.quantity::text AS quantity, i.unit::text AS unit, i.optional,
          f."gramsPerPiece"::text AS "gramsPerPiece", f."densityGPerMl"::text AS "densityGPerMl", f."archivedAt",
          food_safety_category_ids(f.id)::text[] AS "categoryIds",
          jsonb_strip_nulls(jsonb_build_object('CALORIES', n."caloriesPer100g", 'PROTEIN', n."proteinG",
            'CARBS', n."carbsG", 'FAT', n."fatG", 'FIBER', n."fiberG", 'SUGAR', n."sugarG", 'SODIUM', n."sodiumMg")) AS "nutrientsPer100g"
        FROM "RecipeIngredient" i JOIN "Food" f ON f.id = i."foodId"
        LEFT JOIN "NutritionProfile" n ON n."foodId" = f.id
        WHERE i."recipeId" = ANY(${recipes.map(r => r.id)}::uuid[]) ORDER BY i."recipeId", i."foodId"`;
      const batches = await tx.$queryRaw<MatchingBatch[]>`
        SELECT id, "foodId", quantity::text AS quantity, unit::text AS unit, "estimatedExpiryAt"
        FROM "InventoryItem" WHERE "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL AND quantity > 0 ORDER BY id`;
      // One catalog/alias query for the entire set, including staples absent from recipe ingredients.
      const foods = await tx.$queryRaw<FoodRow[]>`
        SELECT f.id, f.name, COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'alias', a.alias,
          'isPrimary', a."isPrimary", 'languageCode', l.code) ORDER BY l.code, a."isPrimary" DESC, a.id)
          FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb) AS aliases
        FROM "Food" f LEFT JOIN "FoodAlias" a ON a."foodId" = f.id LEFT JOIN "Language" l ON l.id = a."languageId"
        WHERE f."archivedAt" IS NULL AND (f.id = ANY(${[...new Set(ingredients.map(i => i.foodId))]}::uuid[])
          OR lower(f.name) = ANY(${[...ASSUMED_STAPLE_NAMES]}::text[])) GROUP BY f.id ORDER BY f.id`;
      const staples = resolveAssumedStaples(foods);
      const byFood = new Map(foods.map(f => [f.id, { foodId: f.id, foodName: f.name, aliases: f.aliases }]));
      const byRecipe = new Map<string, IngredientRow[]>();
      for (const row of ingredients) {
        const group = byRecipe.get(row.recipeId) ?? [];
        group.push(row);
        byRecipe.set(row.recipeId, group);
      }
      const warnings = new Map<string, string[]>();
      const eligible = recipes.flatMap(recipe => {
        const items = byRecipe.get(recipe.id) ?? [];
        // Search also excludes recipes without ingredient data; archived ingredients cannot be assessed.
        if (!items.length || items.some(i => i.archivedAt !== null || !byFood.has(i.foodId))) return [];
        const verdicts = this.safety.evaluate(profile, items);
        if (verdicts.some(v => v.result === 'FAILED')) return [];
        warnings.set(recipe.id, verdicts.filter(v => v.result === 'WARNED').map(v => v.filterType));
        return [{ ...recipe, ingredients: items }];
      });
      const byId = new Map(recipes.map(r => [r.id, r]));
      const enrich = (item: IngredientMatch): SuggestionIngredient => ({ ...item, ...byFood.get(item.foodId)! });
      const ranked = matchAndRankRecipes({ recipes: eligible, batches, householdTimezone: timezone, now, staples: staples.foodIds });
      const nodes: RecipeSuggestion[] = ranked.map(match => ({
        recipe: byId.get(match.recipeId)!, coverageRatio: match.requiredCount ? match.haveCount / match.requiredCount : 0,
        haveCount: match.haveCount, requiredCount: match.requiredCount,
        missing: match.requiredIngredients.filter(i => i.status === 'MISSING').map(enrich),
        expired: match.requiredIngredients.filter(i => i.status === 'EXPIRED').map(enrich),
        short: match.shortItems.map(enrich), unknown: match.unknownItems.map(enrich),
        assumedStaples: match.assumedStaples.map(enrich), optional: match.optionalIngredients.map(enrich),
        expiringSoon: match.expiringSoonFoods.map(item => ({ ...item, ...byFood.get(item.foodId)! })),
        safetyWarnings: warnings.get(match.recipeId)!,
      }));
      return { nodes, missingStapleNames: staples.missingNames };
  }
}

function decodeCursor(value: string): { fingerprint: string; id: string } {
  try {
    if (!value || value.length > 1024) throw new Error();
    const decoded = Buffer.from(value, 'base64url').toString();
    const cursor = JSON.parse(decoded);
    if (Buffer.from(decoded).toString('base64url') !== value || cursor.v !== 1
      || typeof cursor.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.fingerprint)
      || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 100) throw new Error();
    return cursor;
  } catch { throw new DomainError('INVALID_CURSOR', 'The recipe suggestion cursor is invalid.'); }
}
