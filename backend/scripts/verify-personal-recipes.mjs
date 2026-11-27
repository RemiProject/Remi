// End-to-end check for personal recipes (migration 0037) against a running API on an isolated database:
// a recipe follows its author into another household, keeps the author's name there, the old household keeps its
// copy, and the name survives the author deleting their account.
//   REMI_API_URL=http://localhost:3000/graphql node --env-file=.env scripts/verify-personal-recipes.mjs
// DATABASE_URL_MIGRATOR is used only to read the invitation link from the outbox (the email is not sent here).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const endpoint = process.env.REMI_API_URL ?? 'http://localhost:3000/graphql';
const dbUrl = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL_MIGRATOR is required to read the invitation link from the outbox.');

async function gql(query, variables = {}, context = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(context.token ? { authorization: `Bearer ${context.token}` } : {}), ...(context.household ? { 'x-household-id': context.household } : {}) }, body: JSON.stringify({ query, variables }) });
  const body = await response.json();
  if (body.errors) throw new Error(`${body.errors[0].extensions?.code}: ${body.errors[0].message}`);
  return body.data;
}
const step = (message) => console.log(`  ✓ ${message}`);

async function person(label) {
  const suffix = randomBytes(5).toString('hex');
  const email = `${label}.${suffix}@example.test`, password = `Pr!A1-${randomBytes(12).toString('base64url')}`;
  const name = `${label[0].toUpperCase()}${label.slice(1)} ${suffix.slice(0, 4)}`;
  const { register } = await gql('mutation R($input: RegisterInput!) { register(input: $input) { userId } }', { input: { email, username: `${label}_${suffix}`, phoneNumber: `+2011${String(parseInt(suffix.slice(0, 6), 16)).padStart(8, '0')}`, password, name, timezone: 'Africa/Cairo', languageCode: 'ar' } });
  const token = (await gql('mutation L($input: LoginInput!) { login(input: $input) { accessToken } }', { input: { identifier: email, password } })).login.accessToken;
  const household = (await gql('mutation H($input: CreateHouseholdInput!) { createHousehold(input: $input) }', { input: { name: `${name} kitchen`, timezone: 'Africa/Cairo' } }, { token })).createHousehold;
  return { id: register.userId, email, password, name, token, household };
}
const MINE = 'query M($mine: Boolean) { myRecipes(first: 50, createdByMe: $mine) { nodes { id name createdByUserId createdByName } } }';

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
try {
  const sara = await person('sara'), ali = await person('ali');
  const foods = (await gql('query F { foods(search: "tomato", first: 1) { nodes { id } } }', {}, { token: sara.token, household: sara.household })).foods.nodes;
  assert.ok(foods.length, 'catalogue has tomato');

  const created = (await gql('mutation C($input: CreateRecipeInputType!) { createRecipe(input: $input) { id createdByUserId createdByName } }', { input: {
    name: 'Sara tomato salad', servings: 2, difficulty: 'EASY',
    ingredients: [{ foodId: foods[0].id, quantity: '3', unit: 'PIECE' }],
    steps: [{ instruction: 'Slice the tomatoes', durationMin: 3 }, { instruction: 'Season and serve' }],
  } }, { token: sara.token, household: sara.household })).createRecipe;
  assert.equal(created.createdByUserId, sara.id);
  assert.equal(created.createdByName, sara.name);
  step('a new recipe records who added it');

  await gql('mutation I($input: InviteMemberInput!) { inviteMember(input: $input) }', { input: { email: sara.email } }, { token: ali.token, household: ali.household });
  const link = (await db.query(`SELECT payload->>'acceptUrl' AS url FROM "OutboxEvent" WHERE payload->>'to' = $1 AND payload ? 'acceptUrl' ORDER BY id DESC LIMIT 1`, [sara.email])).rows[0]?.url;
  assert.ok(link, 'invitation link is in the outbox');
  const token = new URL(link).searchParams.get('token') ?? link.split('/').pop();
  await gql('mutation A($input: TokenInput!) { acceptInvitation(input: $input) }', { input: { token } }, { token: sara.token });

  const inAli = (await gql(MINE, { mine: false }, { token: ali.token, household: ali.household })).myRecipes.nodes;
  assert.equal(inAli.length, 1);
  assert.equal(inAli[0].name, 'Sara tomato salad');
  assert.equal(inAli[0].createdByName, sara.name);
  assert.notEqual(inAli[0].id, created.id, 'the new household gets its own copy');
  step("joining Ali's household brought Sara's recipe along, under her name");

  const detail = (await gql('query D($id: ID!) { recipe(id: $id) { ingredients { foodId quantity } steps { stepNumber instruction durationMin } } }', { id: inAli[0].id }, { token: ali.token, household: ali.household })).recipe;
  assert.equal(detail.ingredients.length, 1);
  assert.deepEqual(detail.steps.map((s) => s.durationMin), [3, null]);
  step('the copy has the ingredients and the steps');

  assert.equal((await gql(MINE, { mine: true }, { token: ali.token, household: ali.household })).myRecipes.nodes.length, 0);
  assert.equal((await gql(MINE, { mine: true }, { token: sara.token, household: ali.household })).myRecipes.nodes.length, 1);
  step('createdByMe separates "added by you" from the rest of the household');

  assert.equal((await gql(MINE, { mine: false }, { token: sara.token, household: sara.household })).myRecipes.nodes[0].id, created.id);
  step("Sara's first household still has the original");

  await gql('mutation X($input: DeleteAccountInput!) { deleteAccount(input: $input) }', { input: { password: sara.password } }, { token: sara.token });
  const afterDeletion = (await gql(MINE, { mine: false }, { token: ali.token, household: ali.household })).myRecipes.nodes;
  assert.equal(afterDeletion.length, 1);
  assert.equal(afterDeletion[0].createdByName, sara.name);
  step('after Sara deletes her account the recipe stays, still under her name');

  console.log('Personal recipes integration passed.');
} finally {
  await db.end();
}
