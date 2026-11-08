// The generated photo map must point at bundled files and cover every catalogue recipe.
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('every food photo in the generated map exists and every catalogue recipe has one', () => {
  const source = fs.readFileSync('src/data/food-images.ts', 'utf8');
  const files = [...source.matchAll(/require\('\.\.\/\.\.\/(assets\/food\/[^']+)'\)/g)].map(m => m[1]);
  for (const file of new Set(files)) assert.ok(fs.existsSync(file), file);
  const recipes = source.slice(0, source.indexOf('export const ingredientImages')).match(/^  ".*":/gm).length;
  const catalogue = fs.readFileSync('../backend/data/recipes.csv', 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('﻿#') && !l.startsWith('recipe_key')).length;
  assert.equal(recipes, catalogue);
});
