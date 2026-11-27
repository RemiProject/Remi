const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { pantryAnswer, rankPantryRecipes } = require('../src/services/pantry-assistant.ts');
const stock = [
  { foodId: 'tomato', foodName: 'Tomato', quantity: '2.000', unit: 'PIECE', estimatedExpiryAt: '2026-11-05T12:00:00Z', storageLocation: 'FRIDGE' },
  { foodId: 'rice', foodName: 'Rice', quantity: '0.000', unit: 'GRAM', estimatedExpiryAt: null, storageLocation: 'PANTRY' },
  { foodId: 'yogurt', foodName: 'Yogurt', quantity: '1.000', unit: 'CUP', estimatedExpiryAt: '2026-11-01T12:00:00Z', storageLocation: 'FRIDGE' },
];
const recipes = [
  { id: 'rice', name: 'Rice bowl', ingredients: [{ foodId: 'rice', foodName: 'Rice', optional: false }] },
  { id: 'salad', name: 'Tomato salad', ingredients: [{ foodId: 'tomato', foodName: 'Tomato', optional: false }, { foodId: 'herb', foodName: 'Basil', optional: true }] },
];
test('recipe suggestions compare actual food IDs, exclude zero stock, and ignore optional ingredients', () => {
  const ranked = rankPantryRecipes(stock, recipes);
  assert.equal(ranked[0].recipe.id, 'salad');
  assert.equal(ranked[0].matches, 1); assert.equal(ranked[0].total, 1);
  assert.equal(ranked[1].matches, 0);
});
test('use-first response separates past-date stock and does not certify safety', () => {
  const answer = pantryAnswer('What should I use first?', stock, recipes, 'en', '2026-11-03');
  assert.match(answer.text, /Tomato · 2026-11-05/);
  assert.match(answer.text, /1 items are past/);
  assert.match(answer.text, /not a food-safety assessment/);
});
test('household helper answers pantry storage and missing ingredients from current data', () => {
  assert.match(pantryAnswer('What is in my fridge?', stock, recipes, 'en', '2026-11-03').text, /Tomato/);
  assert.doesNotMatch(pantryAnswer('What is in my fridge?', stock, recipes, 'en', '2026-11-03').text, /Rice/);
  assert.match(pantryAnswer('What should I buy?', [], recipes, 'en', '2026-11-03').text, /Rice/);
});
test('health questions do not become unverified medical or safety advice, Arabic is supported', () => {
  assert.match(pantryAnswer('Is this safe for my allergy?', stock, recipes, 'en', '2026-11-03').text, /cannot diagnose/);
  assert.match(pantryAnswer('ما الذي أستخدمه أولاً؟', stock, recipes, 'ar', '2026-11-03').text, /ليست تقييماً/);
});

test('past-date ingredients are excluded from recipe availability matching', () => {
  const meal = { id: 'yogurt', name: 'Yogurt bowl', ingredients: [{ foodId: 'yogurt', foodName: 'Yogurt', optional: false }] };
  assert.equal(rankPantryRecipes(stock, [meal], '2026-11-03')[0].matches, 0);
});
