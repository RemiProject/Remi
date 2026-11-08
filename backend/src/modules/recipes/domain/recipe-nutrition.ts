import { convertQuantity, type FoodConversionFactors } from '@/modules/units/domain/unit-converter.js';
import { Unit } from '@/shared/food-unit.js';

/** Per 100 g, as stored in NutritionProfile. Fibre and sugar are null when the source did not report them. */
export type NutritionPer100g = {
  calories: string; proteinG: string; carbsG: string; fatG: string;
  fiberG: string | null; sugarG: string | null; sodiumMg: string;
};

export type NutritionIngredient = {
  quantity: string; unit: string; optional: boolean;
  food: FoodConversionFactors; per100g: NutritionPer100g | null;
};

export type RecipeNutrition = {
  calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number;
  /** Required ingredients whose grams and nutrition were both known. */
  countedIngredients: number;
  totalIngredients: number;
  /** Nutrients that some counted ingredient does not report, so their totals are lower bounds. */
  incompleteNutrients: string[];
};

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Nutrition per serving, summed from raw ingredient values (the same per-gram maths as meal logging).
 * Optional ingredients are left out. Ingredients without nutrition data or a gram conversion are skipped
 * and show up as countedIngredients < totalIngredients. Returns null when nothing could be counted.
 */
export function recipeNutrition(servings: number, ingredients: NutritionIngredient[]): RecipeNutrition | null {
  const required = ingredients.filter((item) => !item.optional);
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 };
  const incomplete = new Set<string>();
  let counted = 0;
  for (const item of required) {
    if (!item.per100g) continue;
    let grams: number;
    try { grams = Number(convertQuantity(item.quantity, item.unit as Unit, Unit.GRAM, item.food)); }
    catch { continue; } // No density or piece weight for this unit: treat as uncounted, never guess.
    const factor = grams / 100;
    const n = item.per100g;
    totals.calories += Number(n.calories) * factor;
    totals.proteinG += Number(n.proteinG) * factor;
    totals.carbsG += Number(n.carbsG) * factor;
    totals.fatG += Number(n.fatG) * factor;
    totals.sodiumMg += Number(n.sodiumMg) * factor;
    if (n.fiberG === null) incomplete.add('FIBER'); else totals.fiberG += Number(n.fiberG) * factor;
    if (n.sugarG === null) incomplete.add('SUGAR'); else totals.sugarG += Number(n.sugarG) * factor;
    counted++;
  }
  if (!counted || servings < 1) return null;
  return {
    calories: Math.round(totals.calories / servings),
    proteinG: round(totals.proteinG / servings, 1),
    carbsG: round(totals.carbsG / servings, 1),
    fatG: round(totals.fatG / servings, 1),
    fiberG: round(totals.fiberG / servings, 1),
    sugarG: round(totals.sugarG / servings, 1),
    sodiumMg: Math.round(totals.sodiumMg / servings),
    countedIngredients: counted,
    totalIngredients: required.length,
    incompleteNutrients: [...incomplete].sort(),
  };
}
