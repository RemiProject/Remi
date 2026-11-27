import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

const recipes = JSON.parse(await readFile(new URL('../data/cookbook-recipes.json', import.meta.url), 'utf8'));
const foods = JSON.parse(await readFile(new URL('../data/cookbook-foods.json', import.meta.url), 'utf8'));

export function cookbookId(slug) {
  const hex = createHash('sha256').update(`remi-independent-cookbook:${slug}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function seedCookbook(client) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('remi-independent-cookbook-seed'))");
    const categories = new Map((await client.query('SELECT id, code FROM "FoodCategory"')).rows.map(row => [row.code, row.id]));
    const cuisines = new Map((await client.query('SELECT id, code FROM "Cuisine"')).rows.map(row => [row.code, row.id]));
    const foodIds = new Map();
    for (const food of foods) {
      const existing = await client.query('SELECT id FROM "Food" WHERE lower(name) = lower($1) AND "archivedAt" IS NULL ORDER BY id LIMIT 1', [food.name]);
      let id = existing.rows[0]?.id;
      if (!id) {
        const categoryId = categories.get(food.category_code);
        if (!categoryId) throw new Error(`Missing category ${food.category_code}. Run the reference seed first.`);
        id = uuidv7();
        await client.query('INSERT INTO "Food" (id, name, "categoryId", "defaultUnit", "gramsPerPiece", "densityGPerMl") VALUES ($1, $2, $3, $4::"Unit", $5, $6)', [id, food.name, categoryId, food.default_unit, food.grams_per_piece || null, food.density_g_per_ml || null]);
      }
      foodIds.set(food.name, id);
    }
    const memberships = {
      pasta: ['GLUTEN'], 'whole wheat bread': ['GLUTEN'], oats: ['GLUTEN'],
      yogurt: ['DAIRY'], 'low fat milk': ['DAIRY'], 'feta cheese': ['DAIRY'],
      'chicken egg': ['EGGS'], tahini: ['SESAME'], hummus: ['SESAME'],
    };
    for (const [food, codes] of Object.entries(memberships)) {
      for (const code of codes) {
        const categoryId = categories.get(code);
        if (!categoryId) throw new Error(`Missing safety category ${code}`);
        await client.query('INSERT INTO "FoodCategoryMembership" (id, "foodId", "categoryId") VALUES ($1,$2,$3) ON CONFLICT ("foodId", "categoryId") DO NOTHING', [uuidv7(), foodIds.get(food), categoryId]);
      }
    }
    for (const recipe of recipes) {
      const id = cookbookId(recipe.slug);
      const description = `${recipe.description}\n\nOriginal Remi adaptation. Reference: ${recipe.sourceLabel} (${recipe.sourceUrl}). ${recipe.prepNote || ''}`.trim();
      await client.query(`INSERT INTO "Recipe" (id, "householdId", "cuisineId", name, description, servings, "prepTimeMin", "cookTimeMin", difficulty)
        VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8::"RecipeDifficulty")
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, servings=EXCLUDED.servings,
          "prepTimeMin"=EXCLUDED."prepTimeMin", "cookTimeMin"=EXCLUDED."cookTimeMin", "cuisineId"=EXCLUDED."cuisineId", "updatedAt"=now()`,
      [id, cuisines.get(recipe.cuisine) ?? null, recipe.name, description, recipe.servings, recipe.prepTimeMin, recipe.cookTimeMin, recipe.difficulty]);
      for (const ingredient of recipe.ingredients) {
        const foodId = foodIds.get(ingredient.food);
        if (!foodId) throw new Error(`Unresolved ingredient ${ingredient.food}`);
        await client.query(`INSERT INTO "RecipeIngredient" (id, "recipeId", "foodId", quantity, unit, optional) VALUES ($1,$2,$3,$4,$5::"Unit",false)
          ON CONFLICT ("recipeId", "foodId") DO UPDATE SET quantity=EXCLUDED.quantity, unit=EXCLUDED.unit`,
        [cookbookId(`${recipe.slug}:ingredient:${ingredient.food}`), id, foodId, ingredient.quantity, ingredient.unit]);
      }
      for (const [index, step] of recipe.steps.entries()) {
        await client.query(`INSERT INTO "RecipeStep" (id, "recipeId", "stepNumber", instruction, "durationMin") VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT ("recipeId", "stepNumber") DO UPDATE SET instruction=EXCLUDED.instruction, "durationMin"=EXCLUDED."durationMin"`,
        [cookbookId(`${recipe.slug}:step:${index + 1}`), id, index + 1, step.instruction, step.durationMin]);
      }
    }
    await client.query('COMMIT');
    return { recipes: recipes.length, foods: foodIds.size };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_MIGRATOR or DATABASE_URL is required');
  if (!process.argv.includes('--allow-independent-db') || !new URL(url).pathname.includes('remi_cookbook')) {
    throw new Error('This seed is restricted to the independent remi_cookbook database. Pass --allow-independent-db after checking the connection URL.');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { console.log(JSON.stringify(await seedCookbook(client))); }
  finally { await client.end(); }
}
