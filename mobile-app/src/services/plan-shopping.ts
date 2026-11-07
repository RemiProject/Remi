import { planShoppingLines, type ShoppingLine, type StockLine } from '../domain/plan-shopping';
import { kitchenRequest, loadPlans, loadRecipe, loadShopping, operationKey, shiftDay, todayKey, type MealPeriod, type Recipe, type ShoppingList } from './kitchen-api';

/** Plans one meal, creating a week-long plan starting that day when no plan covers the date. */
export async function planMeal({ recipeId, date, mealType, servings }: { recipeId: string; date: string; mealType: MealPeriod; servings: string }) {
  let plan = (await loadPlans(date, date)).find((entry) => entry.startDate <= date && entry.endDate >= date);
  if (!plan) plan = (await kitchenRequest<{ createMealPlan: { id: string; name: string; startDate: string; endDate: string; meals: never[] } }>('mutation NewPlan($input: CreateMealPlanInputType!) { createMealPlan(input: $input) { id name startDate endDate meals { id } } }', { input: { name: 'Weekly kitchen plan', startDate: date, endDate: shiftDay(date, 6) } })).createMealPlan;
  await kitchenRequest('mutation Plan($input: PlanMealInputType!) { planMeal(input: $input) { id } }', { input: { mealPlanId: plan.id, recipeId, mealDate: date, mealType, servings } });
}

/** Adds the ingredients of meals planned from `from` for 7 days to the active shopping list. Returns what was added. */
export async function addPlannedMealsToShopping(stock: readonly StockLine[], from = todayKey()): Promise<{ meals: number; added: ShoppingLine[] }> {
  const meals = (await loadPlans(from, shiftDay(from, 6))).flatMap((plan) => plan.meals).filter((meal) => meal.mealDate >= from && meal.mealDate <= shiftDay(from, 6));
  if (!meals.length) return { meals: 0, added: [] };
  const recipes = new Map<string, Recipe>();
  for (const id of new Set(meals.map((meal) => meal.recipeId))) recipes.set(id, await loadRecipe(id));
  let list: ShoppingList | undefined = (await loadShopping()).find((entry) => entry.status === 'ACTIVE');
  const lines = planShoppingLines({ meals, recipes, stock, list: list?.items ?? [] });
  if (!lines.length) return { meals: meals.length, added: [] };
  if (!list) list = (await kitchenRequest<{ createShoppingList: ShoppingList }>('mutation NewList($input: CreateShoppingListInputType!) { createShoppingList(input: $input) { id name status items { id foodId foodName quantity unit status } } }', { input: { name: 'Kitchen shopping', idempotencyKey: operationKey() } })).createShoppingList;
  // A failed run can simply be repeated: lines already added are NEEDED on the list and are skipped next time.
  for (const line of lines) await kitchenRequest('mutation AddPlanned($input: AddToShoppingListInputType!) { addToShoppingList(input: $input) { id } }', { input: { shoppingListId: list.id, foodId: line.foodId, quantity: line.quantity, unit: line.unit, idempotencyKey: operationKey() } });
  return { meals: meals.length, added: lines };
}

/** Food category ("aisle") per food id, fetched in one aliased query. */
export async function loadFoodAisles(foodIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(foodIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return new Map();
  const query = `query Aisles { ${ids.map((id, index) => `f${index}: food(id: "${id}") { id category { name } }`).join(' ')} }`;
  const data = await kitchenRequest<Record<string, { id: string; category: { name: string } } | null>>(query);
  return new Map(Object.values(data).filter((food): food is { id: string; category: { name: string } } => !!food).map((food) => [food.id, food.category.name]));
}
