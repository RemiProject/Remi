const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

const mocks = { 'expo-image': { Image: 'Image' }, 'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', useWindowDimensions: () => ({ width: 402 }) },
  '@/components/ui/core': { AppText: 'AppText' }, '@/components/ui/icon': { Icon: 'Icon' }, '@/data/cookbook-content': { getCookbookContent: () => undefined },
  '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) }, '@/theme/tokens': { layout: { maxWidth: 720 }, radii: { lg: 22, pill: 999 } } };
const card = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('src/components/recipe-card.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => mocks[id] ?? require(id), card);
const { recipeTabs, filterRecipes, recipeMinutes, useGridCardWidth } = card;
const copy = en => en;
const recipe = (cuisineName, prepTimeMin, cookTimeMin) => ({ cuisineName, prepTimeMin, cookTimeMin });

test('recipe tabs: All and Quick first, then cuisines with enough recipes, most common first', () => {
  const recipes = [...Array(6).fill(recipe('Asian', 5, 5)), ...Array(9).fill(recipe('Egyptian', 5, 5)), ...Array(2).fill(recipe('Greek', 5, 5)), recipe(null, 5, 5)];
  assert.deepEqual(recipeTabs(recipes, copy).map(tab => tab.key), ['all', 'quick', 'cuisine:Egyptian', 'cuisine:Asian']);
  assert.deepEqual(recipeTabs(recipes, copy, 1).map(tab => tab.key), ['all', 'quick', 'cuisine:Egyptian']);
  assert.deepEqual(recipeTabs(recipes, copy, 10, 2).map(tab => tab.key).slice(2), ['cuisine:Egyptian', 'cuisine:Asian', 'cuisine:Greek']);
});
test('recipe filters: quick means 30 minutes or less with a known time; cuisine matches exactly', () => {
  const recipes = [recipe('Egyptian', 10, 20), recipe('Egyptian', 10, 21), recipe('Italian', null, null), recipe('Italian', null, 15)];
  assert.equal(filterRecipes(recipes, 'quick').length, 2);
  assert.equal(filterRecipes(recipes, 'cuisine:Italian').length, 2);
  assert.equal(filterRecipes(recipes, 'all').length, 4);
  assert.equal(recipeMinutes(recipe('x', null, null)), null); assert.equal(recipeMinutes(recipe('x', null, 15)), 15);
});
test('grid cards split the phone width into two columns inside the 20 pt gutter', () => {
  assert.equal(useGridCardWidth(), Math.floor((402 - 40 - 12) / 2));
});
