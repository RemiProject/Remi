import { describe, expect, it } from 'vitest';
import { recipeNutrition, type NutritionIngredient, type NutritionPer100g } from '@/modules/recipes/domain/recipe-nutrition.js';

const per100 = (overrides: Partial<NutritionPer100g> = {}): NutritionPer100g => ({
  calories: '100', proteinG: '10', carbsG: '20', fatG: '5', fiberG: '2', sugarG: '4', sodiumMg: '50', ...overrides,
});
const item = (quantity: string, unit: string, extra: Partial<NutritionIngredient> = {}): NutritionIngredient => ({
  quantity, unit, optional: false, food: {}, per100g: per100(), ...extra,
});

describe('recipeNutrition', () => {
  it('sums grams across units and divides by servings', () => {
    const result = recipeNutrition(2, [
      item('200', 'GRAM'),
      item('0.1', 'KILOGRAM'),
      item('2', 'PIECE', { food: { gramsPerPiece: '50' } }),
      item('1', 'CUP', { food: { densityGPerMl: '0.5' } }), // 240 ml × 0.5 g/ml = 120 g
    ]);
    // 200 + 100 + 100 + 120 = 520 g → 520 kcal → 260 per serving
    expect(result).toMatchObject({ calories: 260, proteinG: 26, carbsG: 52, fatG: 13, fiberG: 5.2, sugarG: 10.4, sodiumMg: 130 });
    expect(result).toMatchObject({ countedIngredients: 4, totalIngredients: 4, incompleteNutrients: [] });
  });

  it('leaves optional ingredients out of both the totals and the count', () => {
    const result = recipeNutrition(1, [item('100', 'GRAM'), item('500', 'GRAM', { optional: true })]);
    expect(result).toMatchObject({ calories: 100, countedIngredients: 1, totalIngredients: 1 });
  });

  it('skips ingredients without nutrition or a gram conversion instead of guessing', () => {
    const result = recipeNutrition(1, [
      item('100', 'GRAM'),
      item('100', 'GRAM', { per100g: null }),
      item('1', 'PIECE'), // no piece weight
      item('2', 'TABLESPOON'), // no density
    ]);
    expect(result).toMatchObject({ calories: 100, countedIngredients: 1, totalIngredients: 4 });
  });

  it('flags nutrients a counted ingredient does not report', () => {
    const result = recipeNutrition(1, [item('100', 'GRAM'), item('100', 'GRAM', { per100g: per100({ sugarG: null }) })]);
    expect(result?.sugarG).toBe(4);
    expect(result?.incompleteNutrients).toEqual(['SUGAR']);
  });

  it('returns null when nothing can be counted', () => {
    expect(recipeNutrition(4, [item('100', 'GRAM', { per100g: null })])).toBeNull();
    expect(recipeNutrition(4, [])).toBeNull();
  });
});
