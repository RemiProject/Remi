// Imports the data-entry CSV files in data/ (see data/README.md) into the global catalog.
//   node --env-file=.env scripts/import-catalog-data.mjs [--dry-run] [--dir=data]
// One transaction for everything: any invalid row -> every error is listed with file:line and nothing is written.
// Safe to re-run: every file is an upsert keyed by a natural key. Catalog tables are read-only to the API role,
// so this uses DATABASE_URL_MIGRATOR.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dir = args.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'data';
const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_MIGRATOR (or DATABASE_URL) is required');

const UNITS = new Set(['GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'PIECE', 'CUP', 'TABLESPOON', 'TEASPOON']);
const DEFAULT_UNITS = new Set(['GRAM', 'MILLILITER', 'PIECE']);
const DIFFICULTY = new Set(['EASY', 'MEDIUM', 'HARD']);
const DECIMAL = /^\d+(?:\.\d{1,3})?$/;

/** RFC 4180 CSV (quotes, "" escapes, commas/newlines inside quotes), UTF-8 BOM from Excel, # comment lines. */
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false; let line = 1; let rowLine = 1;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; field += ch; }
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push({ line: rowLine, cells: row }); row = []; field = ''; line++; rowLine = line;
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push({ line: rowLine, cells: row }); }
  const content = rows.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === '') && !r.cells[0].trimStart().startsWith('#'));
  if (!content.length) return [];
  const header = content[0].cells.map((h) => h.trim());
  return content.slice(1).map((r) => ({ line: r.line, ...Object.fromEntries(header.map((h, i) => [h, (r.cells[i] ?? '').trim()])) }));
}

async function load(file) {
  try { return parseCsv(await readFile(join(dir, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const errors = [];
const counts = {};
const q = async (sql, params) => (await client.query(sql, params)).rows;

/** Runs one row inside a savepoint so a DB error is reported against its line instead of aborting the run. */
async function eachRow(file, rows, fn) {
  counts[file] = 0;
  for (const row of rows) {
    await client.query('SAVEPOINT import_row');
    try { await fn(row); await client.query('RELEASE SAVEPOINT import_row'); counts[file]++; }
    catch (error) { await client.query('ROLLBACK TO SAVEPOINT import_row'); errors.push(`${file}:${row.line}: ${error.message}`); }
  }
}
const fail = (message) => { throw new Error(message); };
const list = (value) => (value ? value.split('|').map((v) => v.trim()).filter(Boolean) : []);
const decimal = (value, name, { optional = false } = {}) => {
  if (!value && optional) return null;
  if (!DECIMAL.test(value)) fail(`${name} must be a number with up to 3 decimals (got "${value}")`);
  return value;
};

try {
  await client.query('BEGIN');
  const categories = new Map((await q('SELECT code, id FROM "FoodCategory"')).map((r) => [r.code, r.id]));
  const cuisines = new Map((await q('SELECT code, id FROM "Cuisine"')).map((r) => [r.code, r.id]));
  const languages = new Map((await q('SELECT code, id FROM "Language"')).map((r) => [r.code, r.id]));
  const category = (code) => categories.get(code) ?? fail(`unknown category_code "${code}" (known: ${[...categories.keys()].join(', ')})`);
  const food = async (name) => {
    if (!name) fail('food is required');
    const rows = await q(`SELECT id FROM "Food" WHERE lower(name) = lower($1) AND "archivedAt" IS NULL
      UNION SELECT a."foodId" FROM "FoodAlias" a JOIN "Food" f ON f.id = a."foodId" WHERE a."aliasNormalized" = normalize_food_alias($1) AND f."archivedAt" IS NULL`, [name]);
    if (rows.length > 1) fail(`food "${name}" is ambiguous (matches ${rows.length} foods); use the English name`);
    return rows[0]?.id ?? fail(`unknown food "${name}" (add it to foods.csv first)`);
  };

  await eachRow('foods.csv', await load('foods.csv'), async (r) => {
    if (!r.name) fail('name is required');
    if (!DEFAULT_UNITS.has(r.default_unit)) fail('default_unit must be GRAM, MILLILITER or PIECE');
    const gramsPerPiece = decimal(r.grams_per_piece, 'grams_per_piece', { optional: true });
    const density = decimal(r.density_g_per_ml, 'density_g_per_ml', { optional: true });
    if (r.default_unit === 'PIECE' && !gramsPerPiece) fail('PIECE foods need grams_per_piece');
    if (r.default_unit === 'MILLILITER' && !density) fail('MILLILITER foods need density_g_per_ml');
    const [{ id }] = await q(`INSERT INTO "Food" (id, "categoryId", name, "defaultUnit", "gramsPerPiece", "densityGPerMl") VALUES ($1, $2, $3, $4::"Unit", $5, $6)
      ON CONFLICT (lower(name)) DO UPDATE SET "categoryId" = EXCLUDED."categoryId", "defaultUnit" = EXCLUDED."defaultUnit",
        "gramsPerPiece" = EXCLUDED."gramsPerPiece", "densityGPerMl" = EXCLUDED."densityGPerMl", "updatedAt" = now() RETURNING id`,
      [uuidv7(), category(r.category_code), r.name, r.default_unit, gramsPerPiece, density]);
    const alias = (language, text, primary) => q(`INSERT INTO "FoodAlias" (id, "foodId", "languageId", alias, "isPrimary") VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [uuidv7(), id, languages.get(language), text, primary]);
    if (r.name_ar) {
      await q(`UPDATE "FoodAlias" SET "isPrimary" = false WHERE "foodId" = $1 AND "languageId" = $2 AND "isPrimary" AND "aliasNormalized" <> normalize_food_alias($3)`, [id, languages.get('ar'), r.name_ar]);
      await q(`INSERT INTO "FoodAlias" (id, "foodId", "languageId", alias, "isPrimary") VALUES ($1, $2, $3, $4, true)
        ON CONFLICT ("languageId", "aliasNormalized") DO UPDATE SET "isPrimary" = true WHERE "FoodAlias"."foodId" = EXCLUDED."foodId"`, [uuidv7(), id, languages.get('ar'), r.name_ar]);
    }
    for (const text of list(r.aliases_ar)) await alias('ar', text, false);
    for (const text of list(r.aliases_en)) await alias('en', text, false);
  });

  await eachRow('food-safety-categories.csv', await load('food-safety-categories.csv'), async (r) => {
    await q(`INSERT INTO "FoodCategoryMembership" (id, "foodId", "categoryId") VALUES ($1, $2, $3) ON CONFLICT ("foodId", "categoryId") DO NOTHING`, [uuidv7(), await food(r.food), category(r.category_code)]);
  });

  await eachRow('nutrition.csv', await load('nutrition.csv'), async (r) => {
    if (!r.source) fail('source is required (where the values come from)');
    const v = ['calories_per_100g', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'].map((k) => decimal(r[k], k));
    await q(`INSERT INTO "NutritionProfile" ("foodId", "caloriesPer100g", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("foodId") DO UPDATE SET "caloriesPer100g" = EXCLUDED."caloriesPer100g", "proteinG" = EXCLUDED."proteinG", "carbsG" = EXCLUDED."carbsG",
        "fatG" = EXCLUDED."fatG", "fiberG" = EXCLUDED."fiberG", "sugarG" = EXCLUDED."sugarG", "sodiumMg" = EXCLUDED."sodiumMg", "updatedAt" = now()`, [await food(r.food), ...v]);
  });

  await eachRow('products.csv', await load('products.csv'), async (r) => {
    if (!r.barcode || !r.name) fail('barcode and name are required');
    if (!UNITS.has(r.package_unit)) fail(`package_unit must be one of ${[...UNITS].join(', ')}`);
    const contains = list(r.contains).map(category), mayContain = list(r.may_contain).map(category);
    if (contains.some((id) => mayContain.includes(id))) fail('a category cannot be in both contains and may_contain');
    const [{ id }] = await q(`INSERT INTO "Product" (id, "foodId", brand, name, barcode, "packageSize", "packageUnit") VALUES ($1, $2, $3, $4, $5, $6, $7::"Unit")
      ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO UPDATE SET "foodId" = EXCLUDED."foodId", brand = EXCLUDED.brand, name = EXCLUDED.name,
        "packageSize" = EXCLUDED."packageSize", "packageUnit" = EXCLUDED."packageUnit" RETURNING id`,
      [uuidv7(), await food(r.food), r.brand || null, r.name, r.barcode, decimal(r.package_size, 'package_size'), r.package_unit]);
    await q(`DELETE FROM "ProductSafetyTag" WHERE "productId" = $1`, [id]);
    for (const [kind, ids] of [['CONTAINS', contains], ['MAY_CONTAIN', mayContain]]) {
      for (const categoryId of ids) await q(`INSERT INTO "ProductSafetyTag" (id, "productId", "categoryId", kind) VALUES ($1, $2, $3, $4::"ProductTagKind")`, [uuidv7(), id, categoryId, kind]);
    }
  });

  const recipeIds = new Map();
  await eachRow('recipes.csv', await load('recipes.csv'), async (r) => {
    if (!r.recipe_key || !r.name) fail('recipe_key and name are required');
    if (recipeIds.has(r.recipe_key)) fail(`duplicate recipe_key "${r.recipe_key}"`);
    if (r.cuisine && !cuisines.has(r.cuisine)) fail(`unknown cuisine "${r.cuisine}"`);
    const difficulty = r.difficulty || 'MEDIUM';
    if (!DIFFICULTY.has(difficulty)) fail('difficulty must be EASY, MEDIUM or HARD');
    const int = (value, name, optional) => (!value && optional ? null : /^\d+$/.test(value) ? Number(value) : fail(`${name} must be a whole number`));
    const values = [r.name, r.description || null, cuisines.get(r.cuisine) ?? null, int(r.servings, 'servings'), int(r.prep_time_min, 'prep_time_min', true), int(r.cook_time_min, 'cook_time_min', true), difficulty];
    const existing = await q(`SELECT id FROM "Recipe" WHERE "householdId" IS NULL AND lower(name) = lower($1) AND "archivedAt" IS NULL ORDER BY id LIMIT 1`, [r.name]);
    const id = existing[0]?.id ?? uuidv7();
    if (existing.length) {
      await q(`UPDATE "Recipe" SET name = $2, description = $3, "cuisineId" = $4, servings = $5, "prepTimeMin" = $6, "cookTimeMin" = $7, difficulty = $8::"RecipeDifficulty", "updatedAt" = now() WHERE id = $1`, [id, ...values]);
      await q(`DELETE FROM "RecipeIngredient" WHERE "recipeId" = $1`, [id]);
      await q(`DELETE FROM "RecipeStep" WHERE "recipeId" = $1`, [id]);
    } else {
      await q(`INSERT INTO "Recipe" (id, "householdId", name, description, "cuisineId", servings, "prepTimeMin", "cookTimeMin", difficulty) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::"RecipeDifficulty")`, [id, ...values]);
    }
    recipeIds.set(r.recipe_key, id);
  });
  const recipe = (key) => recipeIds.get(key) ?? fail(`recipe_key "${key}" is not in recipes.csv (or that row failed)`);

  await eachRow('recipe-ingredients.csv', await load('recipe-ingredients.csv'), async (r) => {
    if (!UNITS.has(r.unit)) fail(`unit must be one of ${[...UNITS].join(', ')}`);
    if (r.optional && !['true', 'false'].includes(r.optional)) fail('optional must be true or false');
    await q(`INSERT INTO "RecipeIngredient" (id, "recipeId", "foodId", quantity, unit, optional) VALUES ($1, $2, $3, $4, $5::"Unit", $6)`,
      [uuidv7(), recipe(r.recipe_key), await food(r.food), decimal(r.quantity, 'quantity'), r.unit, r.optional === 'true']);
  });

  await eachRow('recipe-steps.csv', await load('recipe-steps.csv'), async (r) => {
    if (!/^\d+$/.test(r.step_number) || Number(r.step_number) < 1) fail('step_number must be 1, 2, 3 ...');
    if (!r.instruction) fail('instruction is required');
    if (r.duration_min && !/^\d+$/.test(r.duration_min)) fail('duration_min must be a whole number');
    await q(`INSERT INTO "RecipeStep" (id, "recipeId", "stepNumber", instruction, "durationMin") VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), recipe(r.recipe_key), Number(r.step_number), r.instruction, r.duration_min ? Number(r.duration_min) : null]);
  });

  for (const [key, id] of recipeIds) {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM "RecipeIngredient" WHERE "recipeId" = $1`, [id]);
    if (!n) errors.push(`recipes.csv: recipe "${key}" has no ingredients in recipe-ingredients.csv`);
  }

  if (errors.length) {
    await client.query('ROLLBACK');
    console.error(`Import rejected, nothing was written. Fix these ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
    process.exitCode = 1;
  } else if (dryRun) {
    await client.query('ROLLBACK');
    console.log(`Dry run OK, nothing written. Rows that would be imported: ${JSON.stringify(counts)}`);
  } else {
    await client.query('COMMIT');
    console.log(`Imported: ${JSON.stringify(counts)}`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
