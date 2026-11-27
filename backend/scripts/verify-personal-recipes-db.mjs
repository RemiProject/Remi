// Database-level check for the recipe copy trigger (migration 0037), run as the real API role (kitchen_runtime) so
// row-level security applies. Everything happens in one transaction that is rolled back.
//   node --env-file=.env scripts/verify-personal-recipes-db.mjs
import pg from 'pg';
import { randomUUID as id } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Set DATABASE_URL_TEST to a dedicated disposable PostgreSQL test database.');
const c = new pg.Client({ connectionString: databaseUrl });
await c.connect();
const q = async (sql, params) => (await c.query(sql, params)).rows;
const check = (condition, message, detail) => { if (!condition) throw new Error(`${message}: ${JSON.stringify(detail)}`); console.log(`  ✓ ${message}`); };
const as = (household) => q(`SELECT set_config('app.household_id', $1, true)`, [household]);

await q('BEGIN');
try {
  const ref = (await q(`SELECT (SELECT id FROM "Country" WHERE code = 'EG') country, (SELECT id FROM "Locale" LIMIT 1) locale,
    (SELECT id FROM "Language" WHERE code = 'en') lang, (SELECT id FROM "Food" WHERE name = 'tomato') tomato, (SELECT id FROM "Food" WHERE name = 'onion') onion`))[0];
  if (Object.values(ref).some((v) => !v)) throw new Error(`Reference/catalog seed is incomplete: ${JSON.stringify(ref)}`);
  const U = id(), V = id(), A = id(), B = id(), C = id(), R = id(), RV = id(), ing = id();
  for (const u of [U, V]) await q(`INSERT INTO "User" (id, email, "passwordHash", name, "countryId", "localeId", "preferredLanguageId", timezone) VALUES ($1, $2, 'x', 'Sara', $3, $4, $5, 'Africa/Cairo')`, [u, `${u}@personal-recipes.invalid`, ref.country, ref.locale, ref.lang]);
  for (const h of [A, B, C]) await q(`INSERT INTO "Household" (id, name, timezone) VALUES ($1, 'Personal recipes check', 'Africa/Cairo')`, [h]);
  await q(`INSERT INTO "HouseholdMember" (id, "householdId", "userId", role) VALUES ($1, $2, $3, 'OWNER'), ($4, $2, $5, 'MEMBER')`, [id(), A, U, id(), V]);
  await as(A);
  await q(`INSERT INTO "Recipe" (id, "householdId", name, servings, "sourceUrl", "createdByUserId") VALUES ($1, $2, 'Sara koshari', 4, 'https://example.test/k', $3), ($4, $2, 'Other member dish', 2, null, $5)`, [R, A, U, RV, V]);
  await q(`INSERT INTO "RecipeIngredient" (id, "recipeId", "foodId", quantity, unit) VALUES ($1, $2, $3, 2, 'PIECE'), ($4, $2, $5, 100, 'GRAM')`, [ing, R, ref.tomato, id(), ref.onion]);
  await q(`INSERT INTO "RecipeStep" (id, "recipeId", "stepNumber", instruction, "durationMin") VALUES ($1, $2, 1, 'Chop', 5), ($3, $2, 2, 'Cook', 20)`, [id(), R, id()]);
  await q(`INSERT INTO "RecipeIngredientLine" (id, "recipeId", position, text, "recipeIngredientId") VALUES ($1, $2, 1, '2 tomatoes', $3), ($4, $2, 2, 'a pinch of love', null)`, [id(), R, ing, id()]);

  // From here on, act as the API role the way acceptInvitation runs: app.user_id set, no household context.
  await q('SET LOCAL ROLE kitchen_runtime');
  await q(`SELECT set_config('app.user_id', $1, true)`, [U]);
  await as('');
  await q(`INSERT INTO "HouseholdMember" (id, "householdId", "userId", role) VALUES ($1, $2, $3, 'MEMBER')`, [id(), B, U]);
  check((await q(`SELECT current_setting('app.household_id', true) v`))[0].v === '', "the caller's household context is restored after the copy");

  await as(B);
  const copies = await q(`SELECT id, name, "createdByUserId", "originRecipeId", "sourceUrl" FROM "Recipe" WHERE "householdId" = $1`, [B]);
  check(copies.length === 1 && copies[0].name === 'Sara koshari', "only the joining person's recipes follow them", copies);
  check(copies[0].createdByUserId === U && copies[0].originRecipeId === R && copies[0].sourceUrl === 'https://example.test/k', 'the copy keeps author, origin and source', copies[0]);
  const copy = copies[0].id;
  const ingredients = await q(`SELECT "foodId" FROM "RecipeIngredient" WHERE "recipeId" = $1`, [copy]);
  const steps = await q(`SELECT "stepNumber", "durationMin" FROM "RecipeStep" WHERE "recipeId" = $1 ORDER BY 1`, [copy]);
  const lines = await q(`SELECT l.position, ri."foodId" FROM "RecipeIngredientLine" l LEFT JOIN "RecipeIngredient" ri ON ri.id = l."recipeIngredientId" WHERE l."recipeId" = $1 ORDER BY 1`, [copy]);
  check(ingredients.length === 2 && steps.length === 2 && steps[1].durationMin === 20, 'ingredients and steps are copied', { ingredients, steps });
  check(lines.length === 2 && lines[0].foodId === ref.tomato && lines[1].foodId === null, 'ingredient lines point at the new ingredient rows', lines);

  await as(A);
  check((await q(`SELECT count(*)::int n FROM "Recipe" WHERE "householdId" = $1`, [A]))[0].n === 2, 'the old household keeps its recipes');

  const leaveAndRejoin = async () => {
    await q(`UPDATE "HouseholdMember" SET "leftAt" = now() WHERE "householdId" = $1 AND "userId" = $2`, [B, U]);
    await q(`UPDATE "HouseholdMember" SET "leftAt" = NULL WHERE "householdId" = $1 AND "userId" = $2`, [B, U]);
    await as(B);
  };
  await leaveAndRejoin();
  check((await q(`SELECT count(*)::int n FROM "Recipe" WHERE "householdId" = $1`, [B]))[0].n === 1, 'rejoining does not copy twice');
  await q(`UPDATE "Recipe" SET "archivedAt" = now() WHERE id = $1`, [copy]);
  await leaveAndRejoin();
  check((await q(`SELECT count(*)::int n FROM "Recipe" WHERE "householdId" = $1 AND "archivedAt" IS NULL`, [B]))[0].n === 0, 'a recipe removed from a household is not brought back on rejoin');

  await as('');
  await q(`INSERT INTO "HouseholdMember" (id, "householdId", "userId", role) VALUES ($1, $2, $3, 'OWNER')`, [id(), C, U]);
  await as(C);
  const inC = await q(`SELECT "originRecipeId" FROM "Recipe" WHERE "householdId" = $1`, [C]);
  check(inC.length === 1 && inC[0].originRecipeId === R, 'a third household gets one copy per recipe chain', inC);
  check((await q(`SELECT count(*)::int n FROM "Recipe" WHERE id = $1`, [RV]))[0].n === 0, "RLS still hides other households' recipes");
  console.log('Personal recipes database check passed.');
} finally {
  await q('ROLLBACK');
  await c.end();
}
