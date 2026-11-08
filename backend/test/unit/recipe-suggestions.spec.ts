import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeSuggestionsService, type RecipeSummary } from '@/modules/recipes/application/recipe-suggestions.service.js';
import { SafetyEvaluator, SafetyProfileLoader } from '@/modules/safety/safety.public.js';
import type { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { Unit } from '@/shared/food-unit.js';

const emptyProfile = { allergyFoodIds: [], allergyCategoryIds: [], dislikedFoodIds: [], dislikedCategoryIds: [], dietaryPreferences: [], healthConditions: [], dietaryRules: [] };
const summary = (id: string, extra: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id, name: id, description: 'Recipe', householdId: null, servings: 4, prepTimeMin: 5, cookTimeMin: 10,
  difficulty: 'EASY', cuisineId: null, cuisineName: null, ...extra,
});
const item = (recipeId: string, foodId: string, extra: Record<string, unknown> = {}) => ({
  recipeId, foodId, quantity: '1', unit: Unit.GRAM, optional: false, archivedAt: null,
  gramsPerPiece: null, densityGPerMl: null, categoryIds: ['vegetables'], nutrientsPer100g: {}, ...extra,
});

function harness() {
  const data = {
    recipes: [summary('owned'), summary('missing')],
    ingredients: [item('owned', 'tomato'), item('missing', 'carrot')],
    batches: [{ id: 'batch', foodId: 'tomato', quantity: '2.000', unit: Unit.GRAM, estimatedExpiryAt: new Date('2026-06-03T12:00:00Z') }],
    foods: [
      { id: 'tomato', name: 'tomato', aliases: [{ id: 'alias', alias: 'طماطم', languageCode: 'ar', isPrimary: true }] },
      { id: 'carrot', name: 'carrot', aliases: [] }, { id: 'salt', name: 'salt', aliases: [] },
      { id: 'water', name: 'water', aliases: [] }, { id: 'pepper', name: 'black pepper', aliases: [] },
    ],
    timezone: 'Africa/Cairo', profile: structuredClone(emptyProfile) as any,
  };
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?'); queries.push({ sql, values });
      if (sql.includes('AS snapshot')) return [{ snapshot: data.profile }];
      if (sql.includes('FROM "Household"')) return [{ timezone: data.timezone }];
      if (sql.includes('LEFT JOIN "NutritionProfile" n ON n."foodId" = f."id"\n    WHERE ri."recipeId" = ANY')) return [];
      if (sql.includes('FROM "Recipe"')) return data.recipes;
      if (sql.includes('FROM "RecipeIngredient"')) return data.ingredients;
      if (sql.includes('FROM "InventoryItem"')) return data.batches;
      if (sql.includes('FROM "Food"')) return data.foods;
      throw new Error('Unexpected query');
    }),
  };
  const transactions = { run: vi.fn(async (fn: (db: Tx) => unknown) => fn(tx as unknown as Tx)) } as unknown as TransactionRunner;
  const profiles = new SafetyProfileLoader(transactions);
  const service = new RecipeSuggestionsService(transactions, profiles, new SafetyEvaluator());
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-01T21:30:00Z'));
  return { data, service, transactions, profiles, tx, queries };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('RecipeSuggestionsService', () => {
  it('ranks the full set before paging, enriches aliases, and uses six batched reads plus one nutrition read for the page, with no writes', async () => {
    const h = harness();
    const page = await h.service.list('household', 'user', 1);
    expect(page).toMatchObject({ totalCount: 2, hasNextPage: true, missingStapleNames: [] });
    expect(page.nodes[0]).toMatchObject({ recipe: { id: 'owned', servings: 4 }, coverageRatio: 1, haveCount: 1, requiredCount: 1,
      expiringSoon: [{ foodId: 'tomato', foodName: 'tomato', expiryDay: '2026-06-03', aliases: [{ alias: 'طماطم', languageCode: 'ar', isPrimary: true }] }], safetyWarnings: [] });
    expect(h.queries).toHaveLength(7);
    const nutrition = h.queries.filter(q => q.sql.includes('"NutritionProfile" n ON n."foodId" = f."id"\n    WHERE ri."recipeId" = ANY'));
    expect(nutrition).toHaveLength(1);
    expect(nutrition[0].values).toEqual([['owned']]); // only the returned page, never the whole catalogue
    expect(page.nodes[0].recipe).toHaveProperty('nutrition', null);
    expect(h.transactions.run).toHaveBeenCalledWith(expect.any(Function), { householdId: 'household', userId: 'user', readOnly: true });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1); // shared safety lock, never an inventory write
    const recipes = h.queries.find(q => q.sql.includes('FROM "Recipe"'))!;
    expect(recipes.sql).toContain('r."householdId" IS NULL OR r."householdId" =');
    expect(recipes.values).toContain('household'); expect(recipes.sql).not.toContain('LIMIT');
    expect(h.queries.find(q => q.sql.includes('FROM "InventoryItem"'))!.values).toEqual(['household']);
    expect(h.queries.filter(q => q.sql.includes('FROM "Food"'))).toHaveLength(1);
  });

  it('reports expired-only foods separately from missing using household calendar days and the server clock', async () => {
    const h = harness(); h.data.batches[0].estimatedExpiryAt = new Date('2026-06-01T20:59:59Z');
    h.data.ingredients.push(item('missing', 'tomato', { optional: true }));
    const page = await h.service.list('h', 'u');
    expect(page.nodes.find(n => n.recipe.id === 'owned')).toMatchObject({ haveCount: 0, coverageRatio: 0, missing: [], expired: [{ foodId: 'tomato', foodName: 'tomato', status: 'EXPIRED', availableAmount: '0.000' }] });
    expect(page.nodes.find(n => n.recipe.id === 'missing')).toMatchObject({ missing: [{ foodId: 'carrot' }], expired: [], optional: [{ foodId: 'tomato', status: 'EXPIRED' }] });
    h.data.timezone = 'America/Los_Angeles';
    expect((await h.service.list('h', 'u')).nodes[0].haveCount).toBe(1);
  });

  it('returns short amounts, UNKNOWN ownership, optional ingredients and assumed staples', async () => {
    const h = harness();
    h.data.ingredients = [item('owned', 'tomato', { quantity: '3' }), item('owned', 'salt'),
      item('owned', 'carrot', { optional: true }), item('missing', 'tomato', { unit: Unit.PIECE })];
    const page = await h.service.list('h', 'u');
    expect(page.nodes[0]).toMatchObject({ recipe: { id: 'missing' }, haveCount: 1, coverageRatio: 1, unknown: [{ status: 'UNKNOWN', foodName: 'tomato' }] });
    expect(page.nodes[1]).toMatchObject({ short: [{ missingAmount: '1.000', unit: Unit.GRAM }],
      assumedStaples: [{ foodId: 'salt', status: 'ASSUMED' }], optional: [{ foodId: 'carrot', status: 'MISSING' }] });
  });

  it('uses the existing empty-record safety profile; no onboarding profile is required', async () => {
    const h = harness();
    expect((await h.service.list('h', 'u')).totalCount).toBe(2);
    expect(h.queries[0].sql).toContain('COALESCE');
  });

  it.each(['optional', 'staple'] as const)('never bypasses safety for an %s ingredient', async kind => {
    const h = harness();
    h.data.ingredients.push(item('owned', 'salt', { optional: kind === 'optional' }));
    h.data.profile.allergyFoodIds = ['salt'];
    expect((await h.service.list('h', 'u')).nodes.map(n => n.recipe.id)).toEqual(['missing']);
  });

  it('excludes category-allergy, health-AVOID and dietary-AVOID failures using the shared evaluator', async () => {
    const h = harness();
    h.data.profile.allergyCategoryIds = ['vegetables'];
    expect((await h.service.list('h', 'u')).totalCount).toBe(0);
    h.data.profile.allergyCategoryIds = [];
    h.data.profile.healthConditions = [{ status: 'ACTIVE', rules: [{ ruleType: 'AVOID', targetType: 'FOOD', foodId: 'tomato' }] }];
    expect((await h.service.list('h', 'u')).nodes.map(n => n.recipe.id)).toEqual(['missing']);
    h.data.profile.healthConditions = [];
    h.data.profile.dietaryPreferences = ['VEGAN'];
    h.data.profile.dietaryRules = [{ dietaryPreference: 'VEGAN', rule: { ruleType: 'AVOID', targetType: 'FOOD', foodId: 'carrot' } }];
    expect((await h.service.list('h', 'u')).nodes.map(n => n.recipe.id)).toEqual(['owned']);
  });

  it('retains warned recipes with stable safety codes, matching Search', async () => {
    const h = harness(); h.data.profile.dislikedFoodIds = ['tomato'];
    expect((await h.service.list('h', 'u')).nodes[0].safetyWarnings).toEqual(['DISLIKE_FOOD']);
  });

  it('fails closed for absent or archived ingredient data', async () => {
    const h = harness(); h.data.ingredients = [item('owned', 'tomato', { archivedAt: new Date() })];
    expect((await h.service.list('h', 'u')).totalCount).toBe(0);
  });

  it('surfaces profile/database failures instead of returning unfiltered suggestions', async () => {
    const h = harness(); vi.spyOn(h.profiles, 'loadInTransaction').mockRejectedValue(new Error('profile unavailable'));
    await expect(h.service.list('h', 'u')).rejects.toThrow('profile unavailable');
  });

  it('reports absent catalog staples without assuming IDs', async () => {
    const h = harness(); h.data.foods = h.data.foods.filter(f => f.id !== 'water');
    expect((await h.service.list('h', 'u')).missingStapleNames).toEqual(['water']);
  });

  it('has stable cursors across seconds and page sizes, including a last and empty page', async () => {
    const h = harness(); const first = await h.service.list('h', 'u', 1);
    vi.setSystemTime(new Date('2026-06-01T21:31:00Z'));
    const last = await h.service.list('h', 'u', 50, first.endCursor);
    expect(last).toMatchObject({ totalCount: 2, hasNextPage: false, nodes: [{ recipe: { id: 'missing' } }] });
    const end = await h.service.list('h', 'u', 1, last.endCursor);
    expect(end).toMatchObject({ nodes: [], hasNextPage: false, endCursor: null });
    expect((await h.service.list('h', 'u', 1, null)).nodes).toEqual(first.nodes);
  });

  it.each(['inventory', 'recipe', 'safety', 'day', 'household', 'user'] as const)('rejects stale cursors after a %s change', async change => {
    const h = harness(); const first = await h.service.list('h', 'u', 1);
    if (change === 'inventory') h.data.batches[0].quantity = '0.500';
    if (change === 'recipe') h.data.recipes[0].name = 'Changed';
    if (change === 'safety') h.data.profile.allergyFoodIds = ['tomato'];
    if (change === 'day') vi.setSystemTime(new Date('2026-06-02T21:30:00Z'));
    await expect(h.service.list(change === 'household' ? 'other' : 'h', change === 'user' ? 'other' : 'u', 1, first.endCursor))
      .rejects.toMatchObject({ code: 'STALE_RECIPE_SUGGESTIONS_CURSOR' });
  });

  it('rejects invalid pagination before database access', async () => {
    const h = harness();
    for (const size of [0, -1, 51, 1.5]) await expect(h.service.list('h', 'u', size)).rejects.toMatchObject({ code: 'INVALID_PAGE_SIZE' });
    for (const cursor of ['', 'garbage', Buffer.from('{}').toString('base64url')]) await expect(h.service.list('h', 'u', 1, cursor)).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    expect(h.transactions.run).not.toHaveBeenCalled();
  });
});
