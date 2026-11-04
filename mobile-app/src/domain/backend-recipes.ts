import type { BackendUnit, Decimal } from './backend-inventory';

export interface RecipeFood { foodId: string; foodName: string; arabicName?: string }
export interface RecipeSummary {
  id: string; name: string; description: string | null; servings: number;
  prepTimeMin: number | null; cookTimeMin: number | null; difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  cuisineId: string | null; cuisineName: string | null;
}
export interface RecipeSuggestion {
  recipe: RecipeSummary; coverageRatio: number; haveCount: number; requiredCount: number; safetyWarnings: string[];
  missing: RecipeFood[]; expired: RecipeFood[];
  short: (Pick<RecipeFood, 'foodId'> & { missingAmount: Decimal; unit: BackendUnit })[];
  unknown: Pick<RecipeFood, 'foodId'>[]; assumedStaples: Pick<RecipeFood, 'foodId'>[]; optional: (Pick<RecipeFood, 'foodId'> & { availableAmount?: Decimal | null; status: 'ENOUGH' | 'SHORT' | 'MISSING' | 'EXPIRED' | 'UNKNOWN' | 'ASSUMED' })[];
  expiringSoon: (RecipeFood & { expiryDay: string })[];
}
export interface BackendRecipe extends RecipeSummary {
  ingredients: (RecipeFood & { id: string; quantity: Decimal; unit: BackendUnit; optional: boolean })[];
  steps: { id: string; stepNumber: number; instruction: string; durationMin: number | null }[];
}
export interface RecipePage {
  nodes: RecipeSuggestion[]; hasNextPage: boolean; endCursor: string | null; totalCount: number;
  today: string; restarted: boolean;
}
export interface RecipeRepository {
  list(after?: string | null): Promise<RecipePage>;
  get(id: string): Promise<BackendRecipe>;
  findSuggestion(id: string): Promise<RecipeSuggestion | undefined>;
}
