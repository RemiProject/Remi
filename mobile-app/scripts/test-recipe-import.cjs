// Recipe import helpers: links in shared text, which ingredients link to the catalogue, and the save input.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const { firstUrl, linkedByDefault, saveInput } = require('../src/domain/recipe-import.ts');

test('the first link in shared text, without trailing punctuation', () => {
  assert.equal(firstUrl('Try this! https://www.example.com/koshari?ref=ig.'), 'https://www.example.com/koshari?ref=ig');
  assert.equal(firstUrl('(https://site.com/a-b_c)'), 'https://site.com/a-b_c');
  assert.equal(firstUrl('«https://مثال.com/وصفة»'), 'https://مثال.com/وصفة');
  assert.equal(firstUrl('no link here'), null);
  assert.equal(firstUrl(null), null);
});

test('confident matches with an amount link by default; the save keeps every line', () => {
  const food = { foodId: 'onion-id', name: 'onion' };
  const preview = { sourceUrl: 'https://s/k', sourceName: 'Site', name: 'Koshari', description: null, servings: null, prepTimeMin: 15, cookTimeMin: null, imageUrl: 'https://s/k.jpg', author: null, savedRecipeId: null, steps: ['Fry.', 'Serve.'],
    ingredients: [
      { text: '2 onions', quantity: '2', unit: 'PIECE', name: 'onions', optional: false, confidence: 'HIGH', food, alternatives: [] },
      { text: 'Salt to taste', quantity: null, unit: null, name: 'salt', optional: true, confidence: 'HIGH', food: { foodId: 'salt' }, alternatives: [] },
      { text: '2 cups vegetable stock', quantity: '2', unit: 'CUP', name: 'vegetable stock', optional: false, confidence: 'MEDIUM', food: { foodId: 'oil' }, alternatives: [] },
    ] };
  assert.deepEqual(preview.ingredients.map(linkedByDefault), [true, false, false]);
  const input = saveInput(preview, { name: '  ', servings: 4, linked: new Set([0, 1]) });
  assert.equal(input.name, 'Koshari'); // a cleared title falls back to the page's
  assert.equal(input.servings, 4);
  assert.deepEqual(input.ingredients, [
    { text: '2 onions', optional: false, foodId: 'onion-id', quantity: '2', unit: 'PIECE' },
    { text: 'Salt to taste', optional: true }, // no amount, so it stays text even when chosen
    { text: '2 cups vegetable stock', optional: false },
  ]);
  assert.equal(input.cookTimeMin, undefined);
});
