import type { BackendRecipe, RecipePage, RecipeRepository, RecipeSuggestion } from '../domain/backend-recipes';
import { BackendUnit } from '../domain/backend-inventory';
import { parseDecimal } from '../domain/inventory-decimal';
import { inventoryExpiryDay } from '../domain/backend-inventory-read-model';
import { getActiveHouseholdRevision, resolveActiveHousehold, type ActiveHouseholdStorage } from '../services/active-household-service';
import type { createAuthService } from '../services/auth-service';
import { isBackendInventoryEnabled } from '../services/inventory-feature';
import { loadCachedCatalogArabicNames } from '../services/inventory-catalog-names';
import { nutritionFields } from '../domain/nutrition';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql' | 'getIdentityContext' | 'getIdentityRevision'>;
const summary = `id name description servings prepTimeMin cookTimeMin difficulty cuisineId cuisineName ${nutritionFields}`;
// Fetch aliases through the existing deduplicated catalog loader rather than deeply nesting
// aliases inside every explanation list (which exceeds the API's query-complexity budget).
export const recipeReadOperations = {
  list: `query RecipeSuggestions($first:Int!, $after:String) { recipeSuggestions(first:$first, after:$after) {
    nodes { recipe { ${summary} } coverageRatio haveCount requiredCount safetyWarnings
      missing { foodId foodName } expired { foodId foodName } short { foodId missingAmount unit }
      unknown { foodId } assumedStaples { foodId } optional { foodId status availableAmount }
      expiringSoon { foodId foodName expiryDay } }
    hasNextPage endCursor totalCount } }`,
  get: `query Recipe($id:ID!) { recipe(id:$id) { ${summary}
    ingredients { id foodId foodName quantity unit optional }
    steps { id stepNumber instruction durationMin } } }`,
} as const;
type RawPage = Omit<RecipePage, 'today' | 'restarted'>;
const isStaleCursor = (error: unknown) => (error as { codes?: string[] })?.codes?.includes('STALE_RECIPE_SUGGESTIONS_CURSOR');
export class RecipeReadError extends Error {
  constructor(readonly code: 'STALE_CONTEXT' | 'INVALID_RESPONSE', message: string) { super(message); this.name = 'RecipeReadError'; }
}

export function createGraphqlRecipeRepository(auth: Auth, storage: ActiveHouseholdStorage): RecipeRepository | undefined {
  if (!isBackendInventoryEnabled()) return undefined;
  const stale = () => new RecipeReadError('STALE_CONTEXT', 'Your account or active household changed. Recipe results were discarded; reload to continue.');
  const invalid = () => new RecipeReadError('INVALID_RESPONSE', 'The backend returned invalid recipe data.');
  async function context() {
    const identity = await auth.getIdentityContext();
    const household = await resolveActiveHousehold(auth, storage);
    if (identity.revision !== auth.getIdentityRevision()) throw stale();
    return { identity, household, revision: getActiveHouseholdRevision(auth) };
  }
  type Context = Awaited<ReturnType<typeof context>>;
  function assertContext(current: Context) {
    if (current.identity.revision !== auth.getIdentityRevision() || current.revision !== getActiveHouseholdRevision(auth)) throw stale();
  }
  async function revalidate(current: Context) {
    assertContext(current);
    const household = await resolveActiveHousehold(auth, storage);
    assertContext(current);
    if (household.id !== current.household.id || household.timezone !== current.household.timezone) throw stale();
  }
  async function request<T>(current: Context, query: string, variables: Record<string, unknown>) {
    assertContext(current);
    try {
      const data = await auth.authenticatedGraphql<T>(query, variables, current.household.id);
      await revalidate(current);
      return data;
    } catch (error) { assertContext(current); throw error; }
  }
  async function page(current: Context, after: string | null, first = 20): Promise<RawPage> {
    const data = await request<{ recipeSuggestions: RawPage }>(current, recipeReadOperations.list, { first, after });
    const result = data.recipeSuggestions;
    if (!result || !Array.isArray(result.nodes) || typeof result.hasNextPage !== 'boolean' || !Number.isInteger(result.totalCount)
      || (result.hasNextPage && (!result.endCursor || result.endCursor === after))) throw invalid();
    for (const node of result.nodes) {
      if (!node.recipe?.id || !node.recipe.name || !Number.isInteger(node.haveCount) || !Number.isInteger(node.requiredCount)
        || !['missing', 'expired', 'short', 'unknown', 'assumedStaples', 'optional', 'expiringSoon', 'safetyWarnings'].every(key => Array.isArray(node[key as keyof RecipeSuggestion]))) throw invalid();
      for (const item of node.short) {
        if (!Object.values(BackendUnit).includes(item.unit) || parseDecimal(item.missingAmount) < 0n) throw invalid();
      }
    }
    if (new Set(result.nodes.map(n => n.recipe.id)).size !== result.nodes.length) throw invalid();
    return result;
  }
  async function namesFor(current: Context, ids: string[]) {
    try {
      const names = await loadCachedCatalogArabicNames(auth, ids);
      await revalidate(current);
      return names;
    } catch (error) { assertContext(current); throw error; }
  }
  async function enrich(current: Context, nodes: RecipeSuggestion[]) {
    const refs = nodes.flatMap(n => [...n.missing, ...n.expired, ...n.expiringSoon]);
    const names = await namesFor(current, refs.map(i => i.foodId));
    return nodes.map(node => ({ ...node,
      expired: node.expired.map(item => ({ ...item, arabicName: names.get(item.foodId) })),
      missing: node.missing.map(item => ({ ...item, arabicName: names.get(item.foodId) })),
      expiringSoon: node.expiringSoon.map(item => ({ ...item, arabicName: names.get(item.foodId) })),
    }));
  }
  return {
    async list(after = null) {
      const current = await context();
      let restarted = false, result: RawPage;
      try { result = await page(current, after); }
      catch (error) {
        if (!isStaleCursor(error)) throw error;
        assertContext(current); restarted = true;
        result = await page(current, null); // Exactly one restart; a second stale error surfaces.
      }
      const nodes = await enrich(current, result.nodes);
      return { ...result, nodes, restarted, today: inventoryExpiryDay(new Date().toISOString(), current.household.timezone)! };
    },
    async get(id) {
      const current = await context();
      const { recipe } = await request<{ recipe: BackendRecipe }>(current, recipeReadOperations.get, { id });
      if (!recipe || recipe.id !== id || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) throw invalid();
      for (const item of recipe.ingredients) {
        if (!Object.values(BackendUnit).includes(item.unit) || parseDecimal(item.quantity) <= 0n) throw invalid();
      }
      const names = await namesFor(current, recipe.ingredients.map(i => i.foodId));
      return { ...recipe, ingredients: recipe.ingredients.map(i => ({ ...i, arabicName: names.get(i.foodId) })), steps: [...recipe.steps].sort((a, b) => a.stepNumber - b.stepNumber) };
    },
    async findSuggestion(id) {
      const current = await context();
      for (let attempt = 0; attempt < 2; attempt++) {
        let after: string | null = null;
        const seen = new Set<string>();
        try {
          do {
            const result = await page(current, after, 50);
            const found = result.nodes.find(n => n.recipe.id === id);
            if (found) return found;
            if (!result.hasNextPage) return undefined;
            if (seen.has(result.endCursor!)) throw invalid();
            seen.add(result.endCursor!); after = result.endCursor;
          } while (after);
        } catch (error) {
          if (attempt || !isStaleCursor(error)) throw error;
          assertContext(current);
        }
      }
      return undefined;
    },
  };
}
