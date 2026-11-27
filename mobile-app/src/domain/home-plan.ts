import { isShoppable } from './plan-shopping';

const periodOrder = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER'];

/** Next planned meals from today, by date then meal period. */
export function upcomingMeals<T extends { mealDate: string; mealType: string }>(meals: readonly T[], today: string, limit = 3): T[] {
  return meals.filter((meal) => meal.mealDate >= today)
    .sort((a, b) => a.mealDate.localeCompare(b.mealDate) || periodOrder.indexOf(a.mealType) - periodOrder.indexOf(b.mealType)).slice(0, limit);
}

/** Planned recipes with how many of their required ingredients are still to buy on an active list. */
export function recipesOnList(recipes: readonly { id: string; name: string; ingredients: readonly { foodId: string; foodName: string; optional: boolean }[] }[], items: readonly { foodId: string; status: string }[]) {
  const needed = new Set(items.filter((item) => item.status === 'NEEDED').map((item) => item.foodId));
  return recipes.map((recipe) => {
    const required = recipe.ingredients.filter(isShoppable);
    return { id: recipe.id, name: recipe.name, total: required.length, onList: required.filter((ingredient) => needed.has(ingredient.foodId)).length };
  }).filter((entry) => entry.onList > 0);
}
