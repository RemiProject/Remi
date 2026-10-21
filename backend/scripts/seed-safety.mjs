import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  const conditions = [
    ['T2D', 'Type 2 Diabetes', 'METABOLIC', true],
    ['HYPERTENSION', 'Hypertension', 'CARDIOVASCULAR', true],
    ['CHRONIC_KIDNEY_DISEASE', 'Chronic Kidney Disease', 'RENAL', true],
    ['CELIAC_DISEASE', 'Celiac Disease', 'DIGESTIVE', true],
  ];
  for (const [code, name, group, chronic] of conditions) {
    await client.query(`INSERT INTO "HealthCondition" ("id", "code", "name", "conditionGroup", "isChronic") VALUES ($1, $2, $3, $4::"HealthConditionGroup", $5) ON CONFLICT ("code") DO NOTHING`, [uuidv7(), code, name, group, chronic]);
  }

  const dietaryTargets = [
    ['VEGETARIAN', ['MEAT', 'POULTRY', 'FISH']],
    ['VEGAN', ['MEAT', 'POULTRY', 'FISH', 'DAIRY', 'EGGS']],
    ['GLUTEN_FREE', ['GLUTEN']],
    ['DAIRY_FREE', ['DAIRY']],
  ];
  for (const [diet, categoryCodes] of dietaryTargets) {
    for (const categoryCode of categoryCodes) {
      await client.query(`INSERT INTO "DietaryRule" ("id", "dietaryPreference", "ruleType", "targetType", "categoryId") SELECT $1, $2::"DietaryPreference", 'AVOID', 'CATEGORY', c."id" FROM "FoodCategory" c WHERE c."code" = $3 ON CONFLICT DO NOTHING`, [uuidv7(), diet, categoryCode]);
    }
  }
  await client.query('COMMIT');
  console.log('Safety lookups seeded. No medical nutrient limits were seeded without clinically reviewed values.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
