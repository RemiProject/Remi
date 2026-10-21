// Idempotent reference seed: EG/US · ar/en · ar-EG/en-US · cuisines · food categories.
// ids are uuid v7 generated here (no DB default). Re-running is safe (ON CONFLICT DO NOTHING).
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const countries = [['EG', 'Egypt'], ['US', 'United States']];
const languages: [string, string, boolean][] = [['ar', 'Arabic', true], ['en', 'English', false]];
const locales = [['ar-EG', 'Arabic (Egypt)', 'ar'], ['en-US', 'English (United States)', 'en']];
const cuisines = [['egyptian', 'Egyptian'], ['italian', 'Italian'], ['indian', 'Indian'], ['lebanese', 'Lebanese'], ['american', 'American'], ['asian', 'Asian']];
// Safety categories (GLUTEN, DAIRY, TREE_NUTS, ...) and display categories live in the same table.
const foodCategories = [
  ['VEGETABLES', 'Vegetables'], ['FRUITS', 'Fruits'], ['MEAT', 'Meat'], ['POULTRY', 'Poultry'], ['FISH', 'Fish & Seafood'],
  ['GRAINS', 'Grains'], ['LEGUMES', 'Legumes'], ['SWEETS', 'Sweets'], ['BEVERAGES', 'Beverages'], ['OILS', 'Oils & Fats'],
  ['DAIRY', 'Dairy'], ['GLUTEN', 'Gluten'], ['EGGS', 'Eggs'], ['TREE_NUTS', 'Tree Nuts'], ['PEANUTS', 'Peanuts'], ['SOY', 'Soy'],
];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  for (const [code, name] of countries) await client.query('INSERT INTO "Country" (id, code, name) VALUES ($1, upper($2), $3) ON CONFLICT DO NOTHING', [uuidv7(), code, name]);
  for (const [code, name, isRtl] of languages) await client.query('INSERT INTO "Language" (id, code, name, "isRtl") VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [uuidv7(), code, name, isRtl]);
  for (const [code, name, lang] of locales) {
    await client.query('INSERT INTO "Locale" (id, code, name, "languageId") SELECT $1, $2, $3, id FROM "Language" WHERE code = $4 ON CONFLICT DO NOTHING', [uuidv7(), code, name, lang]);
  }
  for (const [code, name] of cuisines) await client.query('INSERT INTO "Cuisine" (id, code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [uuidv7(), code, name]);
  for (const [code, name] of foodCategories) await client.query('INSERT INTO "FoodCategory" (id, code, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [uuidv7(), code, name]);
  await client.query('COMMIT');
  console.log('reference seed done');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  await client.end();
}
