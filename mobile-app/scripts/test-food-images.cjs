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

test('every catalogue food has a photo, except foods added after the frozen image library', () => {
  // Added after the 800-food library was frozen (2026-11-07); they show the plain food icon until photographed.
  const afterLibrary = ['vegetable oil'];
  const source = fs.readFileSync('src/data/food-images.ts', 'utf8');
  const ingredients = source.slice(source.indexOf('export const ingredientImages'), source.indexOf('export const sourcedImageCredits'));
  const keys = new Set([...ingredients.matchAll(/^  (".*?"):/gm)].map(m => JSON.parse(m[1])));
  const lines = fs.readFileSync('../backend/data/foods.csv', 'utf8').replace(/^﻿/, '').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const nameColumn = lines[0].split(',').indexOf('name');
  const missing = lines.slice(1).map(l => l.split(',')[nameColumn].trim().toLowerCase()).filter(name => !keys.has(name));
  assert.deepEqual(missing, afterLibrary);
});
