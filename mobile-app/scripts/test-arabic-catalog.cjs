const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { recipeContent, recipeContentDirection } = require('../src/i18n/recipe-content.ts');
const { foodName } = require('../src/i18n/catalog-food-names.ts');
const { catalogLabel, localizedUnit } = require('../src/i18n/catalog-labels.ts');
const importer = fs.readFileSync('../backend/scripts/import-catalog-data.mjs', 'utf8');
const parseCsv = new Function(`${importer.slice(importer.indexOf('function parseCsv('), importer.indexOf('\nasync function load('))}; return parseCsv;`)();
const data = name => parseCsv(fs.readFileSync(`../backend/data/${name}.csv`, 'utf8'));

test('every catalogue cooking step and description has Arabic content, with English preserved', () => {
  const steps = data('recipe-steps'), recipes = data('recipes');
  assert.equal(steps.length, 1384);
  assert.equal(recipes.length, 400);
  for (const source of [...steps.map(step => step.instruction), ...recipes.map(recipe => recipe.description)]) {
    const arabic = recipeContent(source, 'ar');
    assert.notEqual(arabic, source, source);
    assert.match(arabic, /[\u0600-\u06ff]/u, source);
    assert.doesNotMatch(arabic, /\b[A-Za-z]{3,}\b/u, source);
    assert.equal(recipeContent(source, 'en'), source);
    assert.equal(recipeContentDirection(source, 'ar'), 'rtl');
  }
  const temperature = 'Bake at 200 °C until deep golden; pour over the syrup and top with pistachios.';
  assert.match(recipeContent(temperature, 'ar'), /200/);
  assert.match(recipeContent(temperature, 'ar'), /الفستق/);
  assert.equal(recipeContent('Thread onto skewers.', 'ar'), 'وزّع القطع في الأسياخ.');
  assert.equal(recipeContent('A custom instruction.', 'ar'), 'A custom instruction.');
  assert.equal(recipeContentDirection('A custom instruction.', 'ar'), 'ltr');
});

test('all 800 catalogue ingredients have Arabic names even when API aliases are unavailable', () => {
  const foods = data('foods');
  assert(foods.length >= 800);
  for (const food of foods) {
    assert.equal(foodName(food.name, 'ar'), food.name_ar, food.name);
    assert.equal(foodName(food.name, 'en'), food.name);
  }
  assert.equal(foodName('Custom family food', 'ar'), 'Custom family food');
});

test('cuisine and enum labels translate without changing filter keys and units translate in both languages', () => {
  assert.equal(catalogLabel('Egyptian', 'ar'), 'مصري');
  assert.equal(catalogLabel('Egyptian', 'en'), 'Egyptian');
  assert.equal(catalogLabel('DINNER', 'ar'), 'العشاء');
  assert.equal(catalogLabel('VEGETARIAN', 'ar'), 'نباتي');
  assert.equal(catalogLabel('OWNER', 'ar'), 'مالك');
  assert.equal(localizedUnit('TABLESPOON', 'ar'), 'ملعقة كبيرة');
  assert.equal(localizedUnit('TABLESPOON', 'en'), 'tbsp');
});
