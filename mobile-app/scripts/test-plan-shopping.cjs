const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { planShoppingLines, toMilli, fromMilli } = require('../src/domain/plan-shopping.ts');

const ing = (foodId, foodName, quantity, unit = 'GRAM', optional = false) => ({ foodId, foodName, quantity, unit, optional });
const recipes = new Map([
  ['stew', { id: 'stew', name: 'Chickpea stew', servings: 4, ingredients: [ing('chickpea', 'Chickpeas', '400'), ing('onion', 'Onion', '1', 'PIECE'), ing('chili', 'Chili', '1', 'PIECE', true)] }],
  ['salad', { id: 'salad', name: 'Chickpea salad', servings: 2, ingredients: [ing('chickpea', 'Chickpeas', '200'), ing('lemon', 'Lemon', '0.5', 'PIECE'), ing('onion', 'Onion', '50')] }],
]);

test('scales to planned servings, merges the same food+unit across recipes, skips optional', () => {
  const lines = planShoppingLines({ meals: [{ recipeId: 'stew', servings: '2.00' }, { recipeId: 'salad', servings: '3' }, { recipeId: 'missing', servings: '2' }], recipes, stock: [], list: [] });
  assert.deepEqual(lines.map((l) => [l.foodName, l.quantity, l.unit, l.recipeNames]), [
    ['Chickpeas', '500', 'GRAM', ['Chickpea stew', 'Chickpea salad']], // 400*2/4 + 200*3/2
    ['Lemon', '0.75', 'PIECE', ['Chickpea salad']],
    ['Onion', '0.5', 'PIECE', ['Chickpea stew']], // different units stay separate
    ['Onion', '75', 'GRAM', ['Chickpea salad']],
  ]);
});

test('subtracts Kitchen stock of the same unit, drops covered foods, skips foods already needed on the list', () => {
  const lines = planShoppingLines({ meals: [{ recipeId: 'stew', servings: '4' }, { recipeId: 'salad', servings: '2' }], recipes,
    stock: [{ foodId: 'chickpea', quantity: '250', unit: 'GRAM' }, { foodId: 'chickpea', quantity: '100', unit: 'GRAM' }, { foodId: 'onion', quantity: '1', unit: 'KILOGRAM' }, { foodId: 'lemon', quantity: '3', unit: 'PIECE' }],
    list: [{ foodId: 'onion', unit: 'PIECE', status: 'NEEDED' }, { foodId: 'onion', unit: 'GRAM', status: 'PURCHASED' }] });
  assert.deepEqual(lines.map((l) => [l.foodName, l.quantity, l.unit]), [['Chickpeas', '250', 'GRAM'], ['Onion', '50', 'GRAM']]);
});

test('exact thousandths with half-up rounding; invalid quantities rejected', () => {
  const thirds = new Map([['r', { id: 'r', name: 'R', servings: 3, ingredients: [ing('salt', 'Salt', '1')] }]]);
  assert.equal(planShoppingLines({ meals: [{ recipeId: 'r', servings: '1' }], recipes: thirds, stock: [], list: [] })[0].quantity, '0.333');
  assert.equal(planShoppingLines({ meals: [{ recipeId: 'r', servings: '2' }], recipes: thirds, stock: [], list: [] })[0].quantity, '0.667');
  assert.equal(fromMilli(toMilli('100.000')), '100'); assert.equal(fromMilli(toMilli('0.05')), '0.05');
  assert.throws(() => toMilli('1e3')); assert.throws(() => toMilli('-1'));
  assert.deepEqual(planShoppingLines({ meals: [], recipes, stock: [], list: [] }), []);
  const soup = new Map([['s', { id: 's', name: 'Soup', servings: 1, ingredients: [ing('water', 'Water', '500', 'MILLILITER'), ing('lentil', 'Lentils', '100')] }]]);
  assert.deepEqual(planShoppingLines({ meals: [{ recipeId: 's', servings: '1' }], recipes: soup, stock: [], list: [] }).map((l) => l.foodName), ['Lentils']);
});

test('Home: upcoming meals sort by date then period from today; recipes on list count required ingredients still needed', () => {
  const { upcomingMeals, recipesOnList } = require('../src/domain/home-plan.ts');
  const meal = (id, mealDate, mealType) => ({ id, mealDate, mealType });
  assert.deepEqual(upcomingMeals([meal('old', '2026-11-06', 'DINNER'), meal('c', '2026-11-08', 'BREAKFAST'), meal('b', '2026-11-07', 'DINNER'), meal('a', '2026-11-07', 'LUNCH'), meal('d', '2026-11-09', 'LUNCH')], '2026-11-07').map((m) => m.id), ['a', 'b', 'c']);
  const recipes = [{ id: 'stew', name: 'Stew', ingredients: [{ foodId: 'chickpea', foodName: 'Chickpeas', optional: false }, { foodId: 'onion', foodName: 'Onion', optional: false }, { foodId: 'chili', foodName: 'Chili', optional: true }, { foodId: 'water', foodName: 'water', optional: false }] }, { id: 'toast', name: 'Toast', ingredients: [{ foodId: 'bread', foodName: 'Bread', optional: false }] }];
  assert.deepEqual(recipesOnList(recipes, [{ foodId: 'chickpea', status: 'NEEDED' }, { foodId: 'chili', status: 'NEEDED' }, { foodId: 'bread', status: 'PURCHASED' }]), [{ id: 'stew', name: 'Stew', total: 2, onList: 1 }]);
});
