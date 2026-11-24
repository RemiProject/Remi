// Backend DietaryPreference values; chosen ones are saved to the user's profile.
export const diets = ['VEGETARIAN', 'VEGAN', 'HALAL', 'GLUTEN_FREE', 'DAIRY_FREE'] as const;
export const goals = ['quick', 'healthy', 'budget', 'family'] as const;
export const MAX_GOALS = 2;
export const MAX_HOUSEHOLD = 6;
export const MAX_RECIPES = 7; // one per day of the first week
export type Diet = (typeof diets)[number];
export type Goal = (typeof goals)[number];
export interface OnboardingAnswers { householdSize: number; diets: Diet[]; goals: Goal[]; recipeIds: string[] }
export const defaultAnswers: OnboardingAnswers = { householdSize: 2, diets: [], goals: [], recipeIds: [] };
export interface OnboardingRecord { version: 1; completedAt: string; skipped: boolean; answers: OnboardingAnswers }

const list = <T extends string>(value: unknown, allowed: readonly T[], max = allowed.length): value is T[] =>
  Array.isArray(value) && value.length <= max && new Set(value).size === value.length && value.every((entry) => allowed.includes(entry as T));
export function validAnswers(value: unknown): value is OnboardingAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  return Object.keys(a).length === 4 && Number.isInteger(a.householdSize) && (a.householdSize as number) >= 1 && (a.householdSize as number) <= MAX_HOUSEHOLD
    && list(a.diets, diets) && list(a.goals, goals, MAX_GOALS)
    && Array.isArray(a.recipeIds) && a.recipeIds.length <= MAX_RECIPES && new Set(a.recipeIds).size === a.recipeIds.length && a.recipeIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id));
}
export function validRecord(value: unknown): value is OnboardingRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return Object.keys(r).length === 4 && r.version === 1 && typeof r.skipped === 'boolean' && validAnswers(r.answers)
    && typeof r.completedAt === 'string' && Number.isFinite(Date.parse(r.completedAt)) && new Date(r.completedAt).toISOString() === r.completedAt;
}
/** Toggles an option in a multi-select, refusing to grow past max. */
export function toggleOption<T>(selected: readonly T[], option: T, max = Infinity): T[] {
  if (selected.includes(option)) return selected.filter((entry) => entry !== option);
  return selected.length >= max ? [...selected] : [...selected, option];
}
