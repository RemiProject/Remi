import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from './auth';
import { getActiveHouseholdRevision, resolveActiveHousehold } from './active-household-service';

export type Unit = 'GRAM' | 'KILOGRAM' | 'MILLILITER' | 'LITER' | 'PIECE' | 'CUP' | 'TABLESPOON' | 'TEASPOON';
export type MealPeriod = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'OTHER';
export interface CatalogFood { id: string; name: string; defaultUnit: Unit }
export interface RecipeSummary { id: string; name: string; description: string | null; servings: number; prepTimeMin: number | null; cookTimeMin: number | null; difficulty: string; cuisineName?: string | null }
export interface Recipe extends RecipeSummary { ingredients: { id: string; foodId: string; foodName: string; quantity: string; unit: Unit; optional: boolean }[]; steps: { id: string; stepNumber: number; instruction: string; durationMin: number | null }[] }
export interface PlannedMeal { id: string; recipeId: string; recipeName: string; mealDate: string; mealType: MealPeriod; servings: string }
export interface MealPlan { id: string; name: string; startDate: string; endDate: string; meals: PlannedMeal[] }
export interface ShoppingItem { id: string; foodId: string; foodName: string; quantity: string; unit: Unit; status: 'NEEDED' | 'PURCHASED' | 'SKIPPED' }
export interface ShoppingList { id: string; name: string; status: string; items: ShoppingItem[] }
export interface NutritionDay { date: string; calories: string; proteinG: string; carbsG: string; fatG: string; mealCount: number; isFinal: boolean }
export interface Profile { dietaryPreferences: string[]; profile: { heightCm: string | null; weightKg: string | null; birthDate: string | null; gender: string | null; activityLevel: string | null } | null; goal: { goalType: string; calorieTarget: number | null; proteinTargetG: number | null; targetWeightKg: string | null } | null; allergies: { foodId: string; foodName: string; severity: string }[]; healthConditions: { healthConditionId: string; name: string; status: string }[] }
export interface Member { userId: string; name: string; email: string; role: 'OWNER' | 'MEMBER' }
export interface Invitation { id: string; email: string; role: string }
export interface Notification { id: string; type: string; createdAt: string; readAt: string | null; foodId: string | null; inventoryItemId: string | null }
export interface Preference { type: string; channel: string; isEnabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null }
export const recipeFields = 'id name description servings prepTimeMin cookTimeMin difficulty cuisineName';
export const recipeDetailFields = `${recipeFields} ingredients { id foodId foodName quantity unit optional } steps { id stepNumber instruction durationMin }`;
export const recipeQuery = `query Cookbook($first: Int!, $after: String) { recipes(first: $first, after: $after) { nodes { ${recipeFields} } endCursor hasNextPage } }`;

export async function kitchenRequest<T>(query: string, variables: Record<string, unknown> = {}, householdScoped = true): Promise<T> {
  const auth = getAuth();
  const revision = auth.getIdentityRevision();
  const household = householdScoped ? await resolveActiveHousehold(auth, AsyncStorage) : undefined;
  if (revision !== auth.getIdentityRevision()) throw new Error('Your account changed. Please try again.');
  const householdRevision = getActiveHouseholdRevision(auth);
  const data = await auth.authenticatedGraphql<T>(query, variables, household?.id);
  if (revision !== auth.getIdentityRevision()) throw new Error('Your account changed. Please try again.');
  if (householdScoped && householdRevision !== getActiveHouseholdRevision(auth)) throw new Error('Your household changed. Please try again.');
  return data;
}
export async function loadRecipes(): Promise<RecipeSummary[]> {
  const result: RecipeSummary[] = [];
  let after: string | null = null;
  do {
    const data: { recipes: { nodes: RecipeSummary[]; endCursor: string | null; hasNextPage: boolean } } = await kitchenRequest(recipeQuery, { first: 50, after });
    result.push(...data.recipes.nodes);
    if (!data.recipes.hasNextPage) return result;
    if (!data.recipes.endCursor || data.recipes.endCursor === after) throw new Error('The recipe catalogue returned an invalid page.');
    after = data.recipes.endCursor;
  } while (after);
  return result;
}
export async function loadRecipe(id: string): Promise<Recipe> { return (await kitchenRequest<{ recipe: Recipe }>(`query Recipe($id: ID!) { recipe(id: $id) { ${recipeDetailFields} } }`, { id })).recipe; }
export async function searchFoods(search: string): Promise<CatalogFood[]> { return (await kitchenRequest<{ foods: { nodes: CatalogFood[] } }>('query FoodChoices($search: String!) { foods(first: 20, search: $search) { nodes { id name defaultUnit } } }', { search }, false)).foods.nodes; }
export function todayKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function shiftDay(date: string, amount: number): string { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return todayKey(value); }
export function unitLabel(unit: Unit): string { return ({ GRAM: 'g', KILOGRAM: 'kg', MILLILITER: 'ml', LITER: 'l', PIECE: 'pcs', CUP: 'cups', TABLESPOON: 'tbsp', TEASPOON: 'tsp' })[unit]; }
let keySequence = 0;
export function operationKey(): string { return globalThis.crypto?.randomUUID?.() ?? `cookbook-${Date.now().toString(36)}-${++keySequence}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }
export function scaleQuantity(quantity: string, servings: number, baseServings: number): string {
  if (!Number.isSafeInteger(servings) || servings < 1 || !Number.isSafeInteger(baseServings) || baseServings < 1 || !/^\d+(?:\.\d{1,3})?$/.test(quantity)) throw new Error('Invalid recipe quantity or serving count.');
  const [whole, fraction = ''] = quantity.split('.');
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  const divisor = BigInt(baseServings);
  const scaled = (milli * BigInt(servings) + divisor / 2n) / divisor;
  if (scaled <= 0n) throw new Error('This portion is too small. Increase the number of servings.');
  return `${scaled / 1000n}.${String(scaled % 1000n).padStart(3, '0')}`;
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Could not complete this request. Please try again.'; }
export async function loadPlans(from: string, to: string) { return (await kitchenRequest<{ mealPlans: MealPlan[] }>('query Plans($from: String!, $to: String!) { mealPlans(from: $from, to: $to) { id name startDate endDate meals { id recipeId recipeName mealDate mealType servings } } }', { from, to })).mealPlans; }
export async function loadShopping() { return (await kitchenRequest<{ shoppingLists: ShoppingList[] }>('{ shoppingLists { id name status items { id foodId foodName quantity unit status } } }')).shoppingLists; }
