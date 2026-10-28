// Run: node backend/scripts/verify-inventory.mjs
// After restarting the backend: node backend/scripts/verify-inventory.mjs --check
// Requires the existing API and seeded catalog. Creates test data; does not delete it.
import { randomBytes, randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const endpoint = process.env.API_URL ?? 'http://localhost:3000/graphql';
const sessionFile = join(tmpdir(), 'remi-verify-inventory-session.json');
const runId = randomBytes(8).toString('hex');
let failures = 0;

async function gql(query, variables = {}, session = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apollo-require-preflight': 'true',
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(session.householdId ? { 'x-household-id': session.householdId } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body.errors ?? body)}`);
  }
  if (!body.data) throw new Error('Response has no GraphQL data');
  return body.data;
}

function check(label, expected, actual) {
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error(`${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
  return `${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`;
}

async function step(number, label, action) {
  try {
    const details = await action();
    console.log(`PASS ${number}. ${label} | ${details}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${number}. ${label} | expected=all checks succeed; actual=${error.message}`);
  }
}

async function registerAndLogin(suffix) {
  const username = `inv_${runId}_${suffix}`;
  const password = `Inv!A9${randomBytes(16).toString('hex')}`;
  // Exact RegisterInput fields from backend/schema.graphql.
  const input = {
    email: `${username}@example.test`, username,
    phoneNumber: `+2010${String(randomInt(100_000_000)).padStart(8, '0')}`,
    password, name: `Inventory verification ${suffix}`,
    countryCode: 'EG', localeCode: 'ar-EG', languageCode: 'ar', timezone: 'Africa/Cairo',
  };
  const registration = await gql(
    'mutation($input:RegisterInput!){register(input:$input){userId}}', { input },
  );
  check('registered user ID present', true, Boolean(registration.register?.userId));
  const token = await login(input.email, password);
  return { token, userId: registration.register.userId, email: input.email, password };
}

async function login(email, password) {
  const data = await gql(
    'mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { identifier: email, password } },
  );
  check('access token present', true, Boolean(data.login?.accessToken));
  return data.login.accessToken;
}

async function createHousehold(session, suffix) {
  const data = await gql(
    'mutation($input:CreateHouseholdInput!){createHousehold(input:$input)}',
    { input: { name: `Inventory ${runId} ${suffix}`, timezone: 'Africa/Cairo' } }, session,
  );
  check('household ID present', true, Boolean(data.createHousehold));
  session.householdId = data.createHousehold;
}

const resultFields = `__typename
  ... on InventoryMutationSuccessType {
    eventId replayed foodId quantity unit
    balances { inventoryItemId quantityDelta balanceAfter }
  }
  ... on InsufficientStockType { available unit }`;

async function mutate(name, input, session) {
  const type = name === 'adjustStock' ? 'InventoryAdjustmentInput' : 'InventoryStockInput';
  const data = await gql(
    `mutation($input:${type}!){${name}(input:$input){${resultFields}}}`, { input }, session,
  );
  return data[name];
}

async function inventory(session) {
  const data = await gql(`query {
    inventory(first:50) { nodes { id foodId quantity unit version } hasNextPage }
  }`, {}, session);
  check('inventory fits one page', false, data.inventory.hasNextPage);
  return data.inventory.nodes.sort((a, b) => a.id.localeCompare(b.id));
}

// Compare decimal values exactly, without floating-point rounding.
function milli(value) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(String(value));
  if (!match) throw new Error(`Invalid inventory quantity: ${value}`);
  return BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
}

async function expectStock(session, expected) {
  const rows = await inventory(session);
  check('batch count', 1, rows.length);
  check('batch ID', batchId, rows[0].id);
  check('food ID', food.id, rows[0].foodId);
  check('unit', food.defaultUnit, rows[0].unit);
  check('quantity in thousandths', milli(expected).toString(), milli(rows[0].quantity).toString());
  return `quantity: expected=${expected} actual=${rows[0].quantity} ${rows[0].unit}`;
}

let primary;
let food;
let addInput;
let added;
let batchId;

if (process.argv.includes('--check')) {
  try {
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'));
    for (const field of ['email', 'password', 'householdId']) {
      if (typeof saved[field] !== 'string' || !saved[field]) {
        throw new Error(`Saved session is missing ${field}; run normal mode first.`);
      }
    }
    const token = await login(saved.email, saved.password);
    const rows = await inventory({ token, householdId: saved.householdId });
    console.log(`PASS --check: logged in; household=${saved.householdId}`);
    console.log('Current inventory:');
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.error(`FAIL --check: ${error.message}`);
    console.error(`Saved session file: ${sessionFile}. Run normal mode first if it is missing.`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

console.log(`Inventory verification | endpoint=${endpoint} run=${runId}`);

await step(1, 'Register first user and log in', async () => {
  primary = await registerAndLogin('a');
  return check('user ID and access token present', true, Boolean(primary.userId && primary.token));
});

await step(2, 'Create first household', async () => {
  await createHousehold(primary, 'a');
  // Store only the first user's test credentials, never access/refresh tokens.
  await writeFile(sessionFile, JSON.stringify({
    email: primary.email, password: primary.password, householdId: primary.householdId,
  }, null, 2), { encoding: 'utf8', mode: 0o600 });
  console.log(`Saved test session: ${sessionFile}`);
  return check('initial inventory', [], await inventory(primary));
});

await step(3, 'Find tomato in catalog', async () => {
  const data = await gql('query{foods(search:"tomato",first:20){nodes{id name defaultUnit}}}', {}, primary);
  food = data.foods.nodes[0];
  const detail = check('matching food found', true, Boolean(food?.id && food.defaultUnit));
  return `${detail}; food=${food.name}; unit=${food.defaultUnit}`;
});

await step(4, 'Add 2 units and verify inventory', async () => {
  addInput = {
    foodId: food.id, amount: '2.000', unit: food.defaultUnit,
    idempotencyKey: `${runId}:add`, storageLocation: 'PANTRY',
  };
  added = await mutate('addStock', addInput, primary);
  check('result type', 'InventoryMutationSuccessType', added.__typename);
  check('replayed', false, added.replayed);
  check('affected batches', 1, added.balances.length);
  batchId = added.balances[0].inventoryItemId;
  return expectStock(primary, '2.000');
});

await step(5, 'Consume 0.5 units', async () => {
  const result = await mutate('consumeStock', {
    foodId: food.id, amount: '0.500', unit: food.defaultUnit, idempotencyKey: `${runId}:consume`,
  }, primary);
  check('result type', 'InventoryMutationSuccessType', result.__typename);
  return expectStock(primary, '1.500');
});

await step(6, 'Reject overconsumption without changing inventory', async () => {
  const before = await inventory(primary);
  const result = await mutate('consumeStock', {
    foodId: food.id, amount: '3.000', unit: food.defaultUnit, idempotencyKey: `${runId}:insufficient`,
  }, primary);
  const detail = check('result type', 'InsufficientStockType', result.__typename);
  check('available', '1500', milli(result.available).toString());
  check('available unit', food.defaultUnit, result.unit);
  check('inventory including versions unchanged', before, await inventory(primary));
  return `${detail}; ${await expectStock(primary, '1.500')}`;
});

await step(7, 'Replay original add without increasing inventory', async () => {
  const before = await inventory(primary);
  const result = await mutate('addStock', addInput, primary);
  check('result type', 'InventoryMutationSuccessType', result.__typename);
  const detail = check('replayed', true, result.replayed);
  check('original event ID', added.eventId, result.eventId);
  check('original balances', added.balances, result.balances);
  check('inventory including versions unchanged', before, await inventory(primary));
  return `${detail}; ${await expectStock(primary, '1.500')}`;
});

await step(8, 'Adjust batch by -0.25 units', async () => {
  const result = await mutate('adjustStock', {
    inventoryItemId: batchId, delta: '-0.250', idempotencyKey: `${runId}:adjust`,
  }, primary);
  check('result type', 'InventoryMutationSuccessType', result.__typename);
  return expectStock(primary, '1.250');
});

await step(9, 'Second user and household have isolated empty inventory', async () => {
  const secondary = await registerAndLogin('b');
  await createHousehold(secondary, 'b');
  check('distinct users', true, primary.userId !== secondary.userId);
  check('distinct households', true, primary.householdId !== secondary.householdId);
  const detail = check('second household inventory', [], await inventory(secondary));
  return `${detail}; first household ${await expectStock(primary, '1.250')}`;
});

console.log(`\n${failures ? 'FAIL' : 'PASS'}: ${9 - failures}/9 steps passed. Test users and households remain in the database.`);
process.exitCode = failures ? 1 : 0;
