import type { BackendUnit, Decimal } from './backend-inventory';

export interface RecipeFood { foodId: string; foodName: string; arabicName?: string }
export interface RecipeSummary {
  id: string; name: string; description: string | null; servings: number;
  prepTimeMin: number | null; cookTimeMin: number | null; difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  cuisineId: string | null; cuisineName: string | null;
}
export interface RecipeSuggestion {
  recipe: RecipeSummary; coverageRatio: number; haveCount: number; requiredCount: number; safetyWarnings: string[];
  missing: RecipeFood[];
  short: (RecipeFood & { missingAmount: Decimal; unit: BackendUnit })[];
  unknown: RecipeFood[]; assumedStaples: RecipeFood[]; optional: RecipeFood[];
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
