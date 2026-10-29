// Run: node backend/scripts/verify-inventory.mjs
// After restarting the backend: node backend/scripts/verify-inventory.mjs --check
// Household isolation (requires Mailpit): node backend/scripts/verify-inventory.mjs --isolation
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
    const error = new Error(`HTTP ${response.status}: ${JSON.stringify(body.errors ?? body)}`);
    error.graphqlErrors = body.errors;
    throw error;
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

async function registerAndLogin(suffix, verify = false) {
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
  if (verify) await verifyTestEmail(input.email);
  const token = await login(input.email, password);
  const session = { token, userId: registration.register.userId, email: input.email, password };
  if (verify) {
    const data = await gql('query{me{id email emailVerifiedAt}}', {}, session);
    check('authenticated user ID', session.userId, data.me.id);
    check('authenticated email', input.email, data.me.email);
    check('email verified', true, Boolean(data.me.emailVerifiedAt));
  }
  return session;
}

async function verifyTestEmail(email) {
  const mailpit = (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!search.ok) throw new Error(`Mailpit search failed: HTTP ${search.status}`);
    const listing = await search.json();
    for (const message of listing.messages ?? []) {
      if (!message.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase())) continue;
      const response = await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(message.ID)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Mailpit message failed: HTTP ${response.status}`);
      const detail = await response.json();
      const match = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`.match(/verify-email\?token=([^\s"'<>]+)/);
      if (!match) continue;
      const token = decodeURIComponent(match[1].split('&')[0]);
      const data = await gql('mutation($input:TokenInput!){verifyEmail(input:$input)}', { input: { token } });
      check('verifyEmail accepted', true, data.verifyEmail);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No verification email arrived in Mailpit for ${email} within 30 seconds.`);
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

async function expectRejected(action, expectedCode) {
  try {
    const result = await action();
    throw new Error(`Expected forbidden/not found (${expectedCode}); actual=${JSON.stringify(result)}`);
  } catch (error) {
    const errors = error.graphqlErrors;
    if (!errors?.length) throw error;
    const rejected = errors.every(({ extensions }) =>
      (extensions?.code === expectedCode && extensions?.status === 404)
      || (extensions?.code === 'FORBIDDEN' && extensions?.status === 403));
    return check('forbidden/not found rejection', true, rejected)
      + `; actual codes=${errors.map(({ extensions }) => extensions?.code).join(',')}`;
  }
}

async function runIsolation() {
  let a;
  let b;
  let ingredient;
  let itemId;
  let original;
  let passed = 0;
  const unchanged = async () => {
    const current = await inventory(a);
    check("A's inventory including versions unchanged", original, current);
    const item = current.find((row) => row.id === itemId);
    check("A's quantity in thousandths", '2000', milli(item?.quantity).toString());
    return `A quantity: expected=2.000 actual=${item.quantity} ${item.unit}`;
  };
  const cases = [
    ['Register, verify and log in user A; create household A', async () => {
      a = await registerAndLogin('a', true);
      await createHousehold(a, 'a');
      return check('initial inventory A', [], await inventory(a));
    }],
    ['Register, verify and log in user B; create household B', async () => {
      b = await registerAndLogin('b', true);
      await createHousehold(b, 'b');
      check('distinct users and households', true, a.userId !== b.userId && a.householdId !== b.householdId);
      return check('initial inventory B', [], await inventory(b));
    }],
    ['User A adds 2 units and saves the batch ID', async () => {
      const data = await gql('query{foods(search:"tomato",first:20){nodes{id name defaultUnit}}}', {}, a);
      ingredient = data.foods.nodes[0];
      check('ingredient found', true, Boolean(ingredient?.id));
      const result = await mutate('addStock', {
        foodId: ingredient.id, amount: '2.000', unit: ingredient.defaultUnit,
        idempotencyKey: `${runId}:isolation:add`,
      }, a);
      check('result type', 'InventoryMutationSuccessType', result.__typename);
      check('affected batches', 1, result.balances.length);
      itemId = result.balances[0].inventoryItemId;
      original = await inventory(a);
      check('A batch count', 1, original.length);
      check('A batch ID', itemId, original[0].id);
      return `${await unchanged()}; itemId=${itemId}`;
    }],
    ["User B cannot list A's item", async () => {
      const rows = await inventory(b);
      check("A's item returned to B", false, rows.some((row) => row.id === itemId));
      return check('inventory B', [], rows);
    }],
    ["User B cannot consume using A's item ID", async () => {
      // consumeStock accepts foodId, not inventoryItemId. A batch ID must be rejected.
      const detail = await expectRejected(() => mutate('consumeStock', {
        foodId: itemId, amount: '0.500', unit: ingredient.defaultUnit,
        idempotencyKey: `${runId}:isolation:consume-item`,
      }, b), 'FOOD_NOT_FOUND');
      return `${detail}; ${await unchanged()}`;
    }],
    ["User B cannot consume A's stock using the correct food ID", async () => {
      const result = await mutate('consumeStock', {
        foodId: ingredient.id, amount: '0.500', unit: ingredient.defaultUnit,
        idempotencyKey: `${runId}:isolation:consume-food`,
      }, b);
      const detail = check('result type', 'InsufficientStockType', result.__typename);
      check('B available stock in thousandths', '0', milli(result.available).toString());
      check('available unit', ingredient.defaultUnit, result.unit);
      return `${detail}; ${await unchanged()}`;
    }],
    ["User B cannot adjust A's item", async () => {
      const detail = await expectRejected(() => mutate('adjustStock', {
        inventoryItemId: itemId, delta: '-0.250', idempotencyKey: `${runId}:isolation:adjust`,
      }, b), 'INVENTORY_ITEM_NOT_FOUND');
      return `${detail}; ${await unchanged()}`;
    }],
    ['User A still has the original quantity; user B remains empty', async () => {
      check('final inventory B', [], await inventory(b));
      return unchanged();
    }],
  ];
  console.log(`Inventory isolation | endpoint=${endpoint} run=${runId}`);
  for (const [label, action] of cases) {
    try {
      console.log(`PASS ${passed + 1}. ${label} | ${await action()}`);
      passed++;
    } catch (error) {
      console.error(`FAIL ${passed + 1}. ${label} | expected=all checks succeed; actual=${error.message}`);
      console.error(`\nFAIL: ${passed}/${cases.length} checks passed; stopped at first failure; ${cases.length - passed - 1} not run.`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\nPASS: ${passed}/${cases.length} checks passed. Test users and households remain in the database.`);
}

let primary;
let food;
let addInput;
let added;
let batchId;

if (process.argv.includes('--isolation')) {
  await runIsolation();
  process.exit(process.exitCode ?? 0);
}

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
