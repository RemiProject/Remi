const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

let language = 'en';
const mocks = { '@/providers/language-provider': { useLanguage: () => ({ language }) }, '@/i18n/recipe-names': require('../src/i18n/recipe-names.ts'), '@/i18n/catalog-labels': require('../src/i18n/catalog-labels.ts'), react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect: () => {}, useMemo: factory => factory() },
  'react-native-reanimated': require('./native-ui-fixture.cjs').fixtureModule('react-native-reanimated'), 'expo-image': { Image: 'Image' }, 'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', useWindowDimensions: () => ({ width: 402 }) },
  '@/components/ui/core': { AppText: 'AppText' }, '@/components/ui/icon': { Icon: 'Icon' }, '@/data/cookbook-content': { getCookbookContent: () => undefined },
  '@/data/food-images': { recipeImages: { 'mish with tomato': 7 } }, '@/domain/nutrition': require('../src/domain/nutrition.ts'),
  '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) }, '@/theme/tokens': { layout: { maxWidth: 720 }, radii: { lg: 22, pill: 999 } } };
const card = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('src/components/recipe-card.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => mocks[id] ?? require(id), card);
const { recipeTabs, filterRecipes, recipeMinutes, useGridCardWidth, recipeImage } = card;
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

test('recipe photos resolve by catalogue name, ignoring case and spacing', () => {
  assert.equal(recipeImage('Mish  with Tomato '), 7);
  assert.equal(recipeImage('Unknown dish'), undefined);
});

test('High protein and Under 500 kcal tabs filter on complete nutrition only', () => {
  const full = { countedIngredients: 3, totalIngredients: 3, incompleteNutrients: [], carbsG: 30, fatG: 10, fiberG: 2, sugarG: 2, sodiumMg: 100 };
  const recipes = [
    { name: 'Lean', prepTimeMin: 10, cookTimeMin: 10, nutrition: { ...full, calories: 450, proteinG: 35 } },
    { name: 'Heavy', prepTimeMin: 10, cookTimeMin: 10, nutrition: { ...full, calories: 900, proteinG: 40 } },
    { name: 'Partial', prepTimeMin: 10, cookTimeMin: 10, nutrition: { ...full, calories: 200, proteinG: 50, countedIngredients: 2 } },
    { name: 'Unknown', prepTimeMin: 10, cookTimeMin: 10, nutrition: null },
  ];
  assert.deepEqual(filterRecipes(recipes, 'protein').map(r => r.name), ['Lean', 'Heavy']);
  assert.deepEqual(filterRecipes(recipes, 'light').map(r => r.name), ['Lean']);
  assert.deepEqual(recipeTabs(recipes, copy, 6, 1).map(t => t.key), ['all', 'quick', 'protein', 'light']);
  assert.deepEqual(recipeTabs(recipes, copy, 6, 3).map(t => t.key), ['all', 'quick'], 'nutrition tabs need at least `min` recipes');
});

test('Arabic titles cover all 400 catalogue photos while English and unknown recipe names stay intact', () => {
  const { recipeName, recipeNameMatches } = require('../src/i18n/recipe-names.ts');
  const names = [...fs.readFileSync('src/data/food-images.ts', 'utf8').split('};')[0].matchAll(/^  "([^"]+)": require/gm)].map(match => match[1]);
  assert.equal(names.length, 400);
  for (const name of names) {
    assert.match(recipeName(name, 'ar'), /[\u0600-\u06ff]/u, name);
    assert.equal(recipeName(name, 'en'), name);
  }
  assert.equal(recipeName('Molokhia with Chicken', 'ar'), 'ملوخية بالدجاج');
  assert.equal(recipeName('Chicken Broth with Vegetables', 'ar'), 'شوربة دجاج بالخضار');
  assert.equal(recipeName('Roasted tomato pasta', 'ar'), 'باستا بالطماطم المشوية');
  assert.equal(recipeName('Family special', 'ar'), 'Family special');
  assert(recipeNameMatches('Molokhia with Chicken', 'ملوخية', 'ar'));
  assert(recipeNameMatches('Molokhia with Chicken', 'chicken', 'ar'));
  assert(!recipeNameMatches('Molokhia with Chicken', 'ملوخية', 'en'));
});

test('switching language changes visible card titles and accessibility labels without changing photos or recipe ids', () => {
  const props = { id: 'recipe-1', name: 'Mish with Tomato', time: '5 min', width: 180, onPress: () => {} };
  const descendants = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(descendants) : [tree, ...descendants(tree.props?.children)];
  try {
    language = 'ar';
    let tree = card.RecipeCard(props);
    assert.match(tree.props.accessibilityLabel, /^مش بالطماطم/);
    const title = descendants(tree).find(node => node.props?.children === 'مش بالطماطم');
    assert.equal(title.props.dir, 'rtl');
    assert.equal(card.RecipeArt({ ...props, height: 140 }).props.source, 7);
    language = 'en';
    tree = card.RecipeCard(props);
    assert.match(tree.props.accessibilityLabel, /^Mish with Tomato/);
    assert.equal(descendants(tree).find(node => node.props?.children === 'Mish with Tomato').props.dir, 'ltr');
    assert.equal(card.RecipeArt({ ...props, height: 140 }).props.source, 7);
  } finally { language = 'en'; }
});
