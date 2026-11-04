import type { BackendUnit } from './backend-inventory';
import type { BackendRecipe, RecipeSuggestion } from './backend-recipes';
import type { InventoryReadItem } from './backend-inventory-read-model';
import { formatDecimal, parseDecimal } from './inventory-decimal';
import { addFoodQuantity } from '../services/backend-add-food';

export const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER'] as const;
export type MealType = typeof mealTypes[number];
export interface MealRow {
  id: string; foodId: string; foodName: string; arabicName?: string; unit: BackendUnit;
  status: 'HAVE' | 'SHORT' | 'UNKNOWN'; optional: boolean; checked: boolean; amount: string;
  recipeAmount: string; available?: string;
}
export function guessMealType(now: Date): MealType {
  const hour = now.getHours();
  return hour < 11 ? 'BREAKFAST' : hour * 60 + now.getMinutes() <= 16 * 60 ? 'LUNCH' : 'DINNER';
}
/** Exact thousandths, rounded half-up once to the API's three-decimal precision. */
export function scaleMealAmount(amount: string, originalServings: string, servings: string): string {
  const denominator = parseDecimal(addFoodQuantity(originalServings));
  const numerator = parseDecimal(amount) * parseDecimal(addFoodQuantity(servings));
  return formatDecimal((numerator + denominator / 2n) / denominator);
}
export function mealRowAmount(row: MealRow, originalServings: number, servings: string): string {
  const desired = parseDecimal(scaleMealAmount(row.recipeAmount, String(originalServings), servings));
  return formatDecimal(row.status === 'SHORT' && row.available !== undefined && parseDecimal(row.available) < desired ? parseDecimal(row.available) : desired);
}
export function mealRows(recipe: BackendRecipe, suggestion: RecipeSuggestion, inventory: InventoryReadItem[], today: string): MealRow[] {
  return recipe.ingredients.flatMap(ingredient => {
    const id = ingredient.foodId, optional = suggestion.optional.find(i => i.foodId === id);
    if (suggestion.assumedStaples.some(i => i.foodId === id) || suggestion.missing.some(i => i.foodId === id)
      || suggestion.expired.some(i => i.foodId === id) || optional && ['ASSUMED', 'MISSING', 'EXPIRED'].includes(optional.status)) return [];
    const short = suggestion.short.find(i => i.foodId === id);
    const status = (ingredient.optional ? optional?.status : short ? 'SHORT' : suggestion.unknown.some(i => i.foodId === id) ? 'UNKNOWN' : 'ENOUGH');
    if (!status) throw new Error('Ingredient matching data is incomplete.');
    const row: MealRow = { id: ingredient.id, foodId: id, foodName: ingredient.foodName, arabicName: ingredient.arabicName,
      unit: ingredient.unit, recipeAmount: ingredient.quantity, optional: ingredient.optional, checked: !ingredient.optional,
      status: status === 'ENOUGH' ? 'HAVE' : status as MealRow['status'], amount: '' };
    if (status === 'UNKNOWN') {
      const batches = inventory.filter(i => i.foodId === id && parseDecimal(i.quantity) > 0n && (!i.expirationDate || i.expirationDate >= today))
        .sort((a, b) => (a.expirationDate ?? '9999-12-31').localeCompare(b.expirationDate ?? '9999-12-31') || a.id.localeCompare(b.id));
      if (!batches.length) throw new Error('Refresh your kitchen before recording this ingredient.');
      row.unit = batches[0].backendUnit;
    } else {
      if (status === 'SHORT') {
        if (ingredient.optional) {
          if (optional?.availableAmount == null) throw new Error('Available ingredient amount is missing.');
          row.available = optional.availableAmount;
        } else {
          const available = parseDecimal(ingredient.quantity) - parseDecimal(short!.missingAmount);
          row.available = formatDecimal(available > 0n ? available : 0n);
        }
      }
      row.amount = mealRowAmount(row, recipe.servings, String(recipe.servings));
    }
    return [row];
  });
}
