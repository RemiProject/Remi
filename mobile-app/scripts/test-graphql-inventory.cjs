const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { createAuthService, authOperations } = require('../src/services/auth-service.ts');
const { createBackendClient, BackendError } = require('../src/services/backend-core.ts');
const { myHouseholdsQuery } = require('../src/services/households-service.ts');
const { resolveActiveHousehold } = require('../src/services/active-household-service.ts');
const { isBackendInventoryEnabled } = require('../src/services/inventory-feature.ts');
const { inventoryExpiryDay, mapInventoryReadItem } = require('../src/domain/backend-inventory-read-model.ts');
const { createGraphqlInventoryRepository, inventoryReadOperations, InventoryReadError } = require('../src/repositories/graphql-inventory-repository.ts');

const originalFlag = process.env.EXPO_PUBLIC_BACKEND_INVENTORY;
test.beforeEach(() => { process.env.EXPO_PUBLIC_BACKEND_INVENTORY = 'true'; });
test.after(() => {
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY;
  else process.env.EXPO_PUBLIC_BACKEND_INVENTORY = originalFlag;
});
const batch = (id, overrides = {}) => ({
  id, foodId: 'tomato', foodName: 'Tomato', quantity: '1.250', unit: 'KILOGRAM',
  storageLocation: 'FRIDGE', estimatedExpiryAt: null, version: 2, ...overrides,
});
const page = (nodes = [], hasNextPage = false, endCursor = null) => ({ nodes, hasNextPage, endCursor });
const membership = (id, timezone = 'Africa/Cairo') => ({ household: { id, timezone, name: id }, role: 'OWNER', joinedAt: '2026-01-01T00:00:00Z' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const transactions = { nodes: [{ id: 'tx', eventId: 'event', movementType: 'ADD', quantityDelta: '1.250', balanceAfter: '1.250', createdAt: '2026-06-01T00:00:00.000Z' }], hasNextPage: true, endCursor: 'transaction-next' };

async function harness({ pages = [page()], detail = { ...batch('batch'), transactions }, transport, timezone = 'Africa/Cairo' } = {}) {
  const calls = [], values = new Map();
  let session = null, user = 'user-a', pageIndex = 0;
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  const backendUrl = 'https://api.example.invalid';
  const client = createBackendClient(backendUrl, async (_url, init) => {
    const call = { ...JSON.parse(init.body), headers: init.headers };
    calls.push(call);
    let data;
    if (call.query === authOperations.login) {
      user = call.variables.input.identifier;
      data = { login: { accessToken: `access-${user}`, refreshToken: `refresh-${user}`, expiresInSeconds: 3600 } };
    } else if (call.query === authOperations.me) data = { me: { id: user } };
    else if (call.query === authOperations.logout) data = { logout: true };
    else if (call.query === myHouseholdsQuery) data = { myHouseholds: [membership('home-a', timezone), membership('home-b', timezone)] };
    else if (transport) return transport(call);
    else if (call.query === inventoryReadOperations.list) data = { inventory: pages[pageIndex++] };
    else if (call.query === inventoryReadOperations.get) data = { inventoryItem: detail };
    else throw new Error(`Unexpected operation: ${call.query}`);
    return Response.json({ data });
  });
  const auth = createAuthService(client, {
    read: async () => session, write: async value => { session = value; }, clear: async () => { session = null; },
  }, backendUrl, () => 1000000);
  const login = id => auth.login({ identifier: id, password: 'test-password' });
  await login(user);
  return {
    auth, storage, calls, login, repo: createGraphqlInventoryRepository(auth, storage),
    select: id => values.set(`remy.active-household.v1:${JSON.stringify([backendUrl, user])}`, id),
    inventoryCalls: () => calls.filter(c => Object.values(inventoryReadOperations).includes(c.query)),
  };
}

test('flag defaults off; disabled factory performs no auth or storage work and local repository is unchanged', async () => {
  for (const value of [undefined, '', 'false', '1', 'TRUE']) {
    if (value === undefined) delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY;
    else process.env.EXPO_PUBLIC_BACKEND_INVENTORY = value;
    assert.equal(isBackendInventoryEnabled(), false);
    const forbidden = new Proxy({}, { get() { throw new Error('Disabled reader touched dependencies'); } });
    assert.equal(createGraphqlInventoryRepository(forbidden, forbidden), undefined);
  }
  const { StoredInventoryRepository } = require('../src/repositories/inventory-repository.ts');
  assert.deepEqual(await new StoredInventoryRepository({ getItem: async () => null }).read(), []);
  const provider = fs.readFileSync('src/providers/inventory-provider.tsx', 'utf8');
  assert.match(provider, /from '@\/repositories\/async-storage-inventory-repository'/);
  assert.doesNotMatch(provider, /graphql-inventory|BACKEND_INVENTORY/);
});

for (const [name, pages, expected] of [
  ['empty inventory', [page()], []],
  ['one page', [page([batch('one')])], ['one']],
  ['many pages including an empty intermediate page', [page([batch('one')], true, 'c1'), page([], true, 'c2'), page([batch('two')])], ['one', 'two']],
]) {
  test(`list loads all pages: ${name}`, async () => {
    const h = await harness({ pages });
    assert.deepEqual((await h.repo.list()).map(item => item.id), expected);
    assert.equal(h.inventoryCalls().length, pages.length);
    assert.deepEqual(h.inventoryCalls().map(c => c.variables.after), pages.map((_p, i) => i === 0 ? null : pages[i - 1].endCursor));
    for (const call of h.inventoryCalls()) {
      assert.equal(call.variables.first, 50);
      assert.equal(call.headers.Authorization, 'Bearer access-user-a');
      assert.equal(call.headers['x-household-id'], 'home-a');
    }
  });
}

test('list excludes all zero formats, retains exact positive quantities and omits unavailable fields', async () => {
  const h = await harness({ pages: [page([batch('zero', { quantity: '0' }), batch('zero-three', { quantity: '0.000' }), batch('positive', { quantity: '0.001' })])] });
  const result = await h.repo.list();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    id: 'positive', foodId: 'tomato', name: 'Tomato', quantity: '0.001', unitId: 'kg', storageId: 'refrigerator',
    backendUnit: 'KILOGRAM', backendStorageLocation: 'FRIDGE', readOnly: false, expirationDate: null, version: 2,
  });
  for (const field of ['notes', 'photo', 'photoRef', 'categoryId', 'purchaseDate', 'createdAt', 'updatedAt']) assert.equal(Object.hasOwn(result[0], field), false);
});

for (const unit of ['TABLESPOON', 'TEASPOON']) {
  test(`unsupported unit ${unit} is kept as read-only with its backend value`, async () => {
    const h = await harness({ pages: [page([batch('unsupported', { unit })])] });
    const [item] = await h.repo.list();
    assert.equal(item.backendUnit, unit);
    assert.equal(item.unitId, null);
    assert.equal(item.readOnly, true);
    assert.equal(item.storageId, 'refrigerator');
  });
}
for (const storageLocation of ['COUNTER', 'OTHER']) {
  test(`unsupported storage ${storageLocation} is kept as read-only with its backend value`, async () => {
    const h = await harness({ pages: [page([batch('unsupported', { storageLocation })])] });
    const [item] = await h.repo.list();
    assert.equal(item.backendStorageLocation, storageLocation);
    assert.equal(item.storageId, null);
    assert.equal(item.readOnly, true);
    assert.equal(item.unitId, 'kg');
  });
}

test('both unsupported enum values are preserved together', () => {
  const item = mapInventoryReadItem(batch('both', { unit: 'TEASPOON', storageLocation: 'OTHER' }), 'UTC');
  assert.equal(item.readOnly, true);
  assert.equal(item.backendUnit, 'TEASPOON');
  assert.equal(item.backendStorageLocation, 'OTHER');
});

for (const [timestamp, timezone, expected] of [
  ['2026-06-01T23:30:00.000Z', 'Africa/Cairo', '2026-06-02'],
  ['2026-06-01T23:30:00.000Z', 'America/Los_Angeles', '2026-06-01'],
  ['2026-06-01T00:30:00.000Z', 'America/Los_Angeles', '2026-05-31'],
  ['2026-06-01T00:30:00.000Z', 'Africa/Cairo', '2026-06-01'],
  ['2026-01-01T00:15:00.000Z', 'America/Los_Angeles', '2025-12-31'],
  ['2026-03-08T09:59:59.000Z', 'America/Los_Angeles', '2026-03-08'],
  ['2026-03-08T10:00:00.000Z', 'America/Los_Angeles', '2026-03-08'],
  [null, 'Africa/Cairo', null],
]) {
  test(`expiry ${timestamp} -> ${expected} in ${timezone}`, () => {
    assert.equal(inventoryExpiryDay(timestamp, timezone), expected);
  });
}

test('list and get use household timezone rather than device/UTC dates', async () => {
  const item = batch('batch', { estimatedExpiryAt: '2026-06-01T23:30:00.000Z' });
  const h = await harness({ pages: [page([item])], detail: { ...item, transactions }, timezone: 'Africa/Cairo' });
  assert.equal((await h.repo.list())[0].expirationDate, '2026-06-02');
  assert.equal((await h.repo.get('batch')).expirationDate, '2026-06-02');
});

test('get loads a batch, including a zero balance and the transaction page returned by inventoryItem', async () => {
  const h = await harness({ detail: { ...batch('batch', { quantity: '0' }), transactions } });
  const item = await h.repo.get('batch');
  assert.equal(item.quantity, '0.000');
  assert.deepEqual(item.transactions, transactions);
  const [call] = h.inventoryCalls();
  assert.equal(call.headers['x-household-id'], 'home-a');
  assert.deepEqual(call.variables, { id: 'batch' });
});

for (const method of ['list', 'get']) {
  for (const change of ['identity', 'household', 'household-away-and-back']) {
    test(`${method} discards stale responses after ${change} change`, async () => {
      const entered = deferred(), release = deferred();
      const h = await harness({ transport: async call => {
        entered.resolve();
        await release.promise;
        return Response.json({ data: call.query === inventoryReadOperations.list ? { inventory: page([batch('batch')]) } : { inventoryItem: { ...batch('batch'), transactions } } });
      } });
      const result = h.repo[method]('batch');
      const rejected = assert.rejects(result, error => error instanceof InventoryReadError && error.code === 'STALE_CONTEXT');
      await entered.promise;
      if (change === 'identity') await h.login('user-b');
      else {
        h.select('home-b');
        if (change === 'household-away-and-back') {
          await resolveActiveHousehold(h.auth, h.storage);
          h.select('home-a');
          await resolveActiveHousehold(h.auth, h.storage);
        }
      }
      release.resolve();
      await rejected;
    });
  }
}

test('household change between pages discards all accumulated results and sends no further page', async () => {
  const h = await harness({ transport: async () => {
    h.select('home-b');
    return Response.json({ data: { inventory: page([batch('first')], true, 'next') } });
  } });
  await assert.rejects(h.repo.list(), { code: 'STALE_CONTEXT' });
  assert.equal(h.inventoryCalls().length, 1);
});

for (const failure of ['network', 'forbidden', 'not-found']) {
  test(`${failure} surfaces without local fallback`, async () => {
    const h = await harness({ transport: async () => {
      if (failure === 'network') throw new Error('Offline');
      return Response.json({ errors: [{ message: 'Rejected', extensions: { code: failure === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND' } }] });
    } });
    for (const operation of [() => h.repo.list(), () => h.repo.get('missing')]) await assert.rejects(operation(), BackendError);
    assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 0);
  });
}

test('missing or repeated continuation cursors fail instead of looping or returning a partial list', async () => {
  for (const pages of [[page([], true, null)], [page([], true, 'same'), page([], true, 'same')]]) {
    const h = await harness({ pages });
    await assert.rejects(h.repo.list(), { code: 'INVALID_RESPONSE' });
    assert.equal(h.inventoryCalls().length, pages.length);
  }
});

test('a later page failure rejects the full list instead of returning accumulated batches', async () => {
  let count = 0;
  const h = await harness({ transport: async () => {
    if (count++ === 0) return Response.json({ data: { inventory: page([batch('first')], true, 'next') } });
    throw new Error('Connection lost on page two');
  } });
  await assert.rejects(h.repo.list(), BackendError);
  assert.equal(h.inventoryCalls().length, 2);
});

test('malformed decimal/expiry data fails instead of dropping a positive batch', async () => {
  for (const overrides of [{ quantity: 'NaN' }, { quantity: '1.0001' }, { estimatedExpiryAt: 'invalid' }]) {
    const h = await harness({ pages: [page([batch('bad', overrides)])] });
    await assert.rejects(h.repo.list());
  }
});

test('read operations validate against the actual backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const document of Object.values(inventoryReadOperations)) assert.deepEqual(validate(schema, parse(document)), []);
});
