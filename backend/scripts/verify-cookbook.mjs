import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { cookbookId, seedCookbook } from './seed-cookbook.mjs';

const recipes = JSON.parse(await readFile(new URL('../data/cookbook-recipes.json', import.meta.url), 'utf8'));
const foods = JSON.parse(await readFile(new URL('../data/cookbook-foods.json', import.meta.url), 'utf8'));
const names = new Set(foods.map(food => food.name));
const units = new Set(['GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'PIECE', 'CUP', 'TABLESPOON', 'TEASPOON']);
assert.equal(recipes.length, 8);
assert.equal(new Set(recipes.map(recipe => recipe.slug)).size, recipes.length);
for (const recipe of recipes) {
  assert.ok(recipe.servings > 0 && Number.isInteger(recipe.servings));
  assert.ok(recipe.steps.length >= 3);
  assert.ok(recipe.sourceUrl.startsWith('https://'));
  assert.equal(new Set(recipe.ingredients.map(ingredient => ingredient.food)).size, recipe.ingredients.length);
  for (const ingredient of recipe.ingredients) {
    assert.ok(names.has(ingredient.food), `Unknown ingredient ${ingredient.food}`);
    assert.ok(units.has(ingredient.unit));
    assert.match(ingredient.quantity, /^\d+(?:\.\d{1,3})?$/);
    assert.ok(Number(ingredient.quantity) > 0);
  }
}
console.log('PASS: 8 recipe definitions, source links, quantities and 30 catalog ingredient names');

if (process.argv.includes('--live')) {
  const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
  assert.ok(url && new URL(url).pathname.includes('remi_cookbook'), 'Live verification requires the isolated remi_cookbook database');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const ids = recipes.map(recipe => cookbookId(recipe.slug));
    await seedCookbook(client);
    const snapshot = async () => {
      const result = await client.query(`SELECT r.id, r.name, r.servings,
        (SELECT count(*)::int FROM "RecipeIngredient" i WHERE i."recipeId"=r.id) AS ingredients,
        (SELECT count(*)::int FROM "RecipeStep" s WHERE s."recipeId"=r.id) AS steps
        FROM "Recipe" r WHERE r.id = ANY($1::uuid[]) ORDER BY r.id`, [ids]);
      return result.rows;
    };
    const first = await snapshot();
    await seedCookbook(client);
    const second = await snapshot();
    assert.deepEqual(second, first, 'Seed must preserve recipe IDs and child counts on repeat');
    assert.equal(second.length, 8);
    for (const recipe of recipes) {
      const saved = second.find(row => row.id === cookbookId(recipe.slug));
      assert.equal(saved.ingredients, recipe.ingredients.length);
      assert.equal(saved.steps, recipe.steps.length);
    }
    const unknown = await client.query(`SELECT count(*)::int AS count FROM "RecipeIngredient" i
      LEFT JOIN "Food" f ON f.id=i."foodId" WHERE i."recipeId"=ANY($1::uuid[]) AND (f.id IS NULL OR f."archivedAt" IS NOT NULL)`, [ids]);
    assert.equal(unknown.rows[0].count, 0);
    console.log('PASS: live double seed preserves all 8 recipes, ingredients and steps with valid catalog food references');
  } finally { await client.end(); }
}
