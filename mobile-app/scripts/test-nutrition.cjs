// Recipe nutrition rules: labels only on complete data, energy split, planner day totals, card energy text.
const test = require('node:test');
const assert = require('node:assert/strict');
const n = require('../src/domain/nutrition.ts');

const base = { calories: 350, proteinG: 32, carbsG: 15, fatG: 12, fiberG: 9, sugarG: 4, sodiumMg: 400, countedIngredients: 5, totalIngredients: 5, incompleteNutrients: [] };

test('labels follow the per-serving thresholds and need complete data', () => {
  assert.deepEqual(n.nutritionLabels(base), ['high-protein', 'high-fibre', 'low-calorie', 'low-carb']);
  assert.deepEqual(n.nutritionLabels({ ...base, proteinG: 29.9, fiberG: 7.9, calories: 401, carbsG: 20.1 }), []);
  assert.deepEqual(n.nutritionLabels({ ...base, countedIngredients: 4 }), [], 'a partial total could wrongly read as low calorie');
  assert.deepEqual(n.nutritionLabels({ ...base, incompleteNutrients: ['FIBER'] }), ['high-protein', 'low-calorie', 'low-carb']);
  assert.deepEqual(n.nutritionLabels(null), []);
});

test('energy split uses 4/4/9 kcal per gram and adds up to 100', () => {
  assert.deepEqual(n.energySplit({ proteinG: 10, carbsG: 81, fatG: 10.6 }), { protein: 9, carbs: 71, fat: 20 });
  assert.deepEqual(n.energySplit({ proteinG: 0, carbsG: 0, fatG: 0 }), { protein: 0, carbs: 0, fat: 0 });
  const s = n.energySplit({ proteinG: 1, carbsG: 1, fatG: 1 });
  assert.equal(s.protein + s.carbs + s.fat, 100);
});

test('planned day totals add one serving of each meal and count meals without full data', () => {
  const byRecipe = new Map([['a', base], ['b', { ...base, calories: 500, proteinG: 10.4, countedIngredients: 3 }], ['c', null]]);
  const totals = n.plannedDayTotals([{ recipeId: 'a' }, { recipeId: 'b' }, { recipeId: 'c' }], byRecipe);
  assert.deepEqual(totals, { calories: 850, proteinG: 42, carbsG: 30, fatG: 24, meals: 3, missing: 2 });
  assert.deepEqual(n.plannedDayTotals([], byRecipe), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: 0, missing: 0 });
});

test('card energy marks partial totals as a lower bound and uses the language number format', () => {
  assert.equal(n.energyLabel(base, 'en'), '350 kcal');
  assert.equal(n.energyLabel({ ...base, countedIngredients: 2 }, 'en'), '350+ kcal');
  assert.equal(n.energyLabel(base, 'ar'), `${(350).toLocaleString('ar')} سعرة`);
  assert.equal(n.energyLabel(null, 'en'), null);
  assert.equal(n.percentOf(500, 2000), 25);
  assert.equal(n.percentOf(500, null), null);
});
