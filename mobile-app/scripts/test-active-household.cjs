const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { createAuthService, authOperations } = require('../src/services/auth-service.ts');
const { createBackendClient } = require('../src/services/backend-core.ts');
const { myHouseholdsQuery } = require('../src/services/households-service.ts');
const { resolveActiveHousehold, createHouseholdMutation, ActiveHouseholdError } = require('../src/services/active-household-service.ts');
const household = id => ({ id, name: `Kitchen ${id}`, timezone: 'Africa/Cairo' });
const member = id => ({ household: household(id), role: 'OWNER', joinedAt: '2026-01-01T00:00:00Z' });
const key = (url, id) => `remy.active-household.v1:${JSON.stringify([url, id])}`;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: async k => values.get(k) ?? null,
    setItem: async (k, value) => { values.set(k, value); },
    removeItem: async k => { values.delete(k); },
  };
}

function harness({ memberships = [member('one')], backendUrl = 'https://api.example.invalid', userId = 'user-a', transport } = {}) {
  let session = null;
  let currentUser = userId;
  const calls = [];
  const client = createBackendClient(backendUrl, async (_url, init) => {
    const call = { ...JSON.parse(init.body), headers: init.headers };
    calls.push(call);
    let data;
    if (call.query === authOperations.login) {
      currentUser = call.variables.input.identifier;
      data = { login: { accessToken: `access-${currentUser}`, refreshToken: `refresh-${currentUser}`, expiresInSeconds: 3600 } };
    } else if (call.query === authOperations.me) data = { me: { id: currentUser } };
    else if (call.query === authOperations.logout) data = { logout: true };
    else if (call.query === authOperations.reset) data = { resetPassword: true };
    else if (call.query === authOperations.refresh) data = { refreshAccessToken: { accessToken: 'rotated', refreshToken: 'rotated-refresh', expiresInSeconds: 3600 } };
    else if (transport) return transport(call);
    else if (call.query === myHouseholdsQuery) data = { myHouseholds: typeof memberships === 'function' ? memberships(currentUser) : memberships };
    else if (call.query === createHouseholdMutation) data = { createHousehold: 'created' };
    else throw new Error(`Unexpected operation: ${call.query}`);
    return Response.json({ data });
  });
  const authStorage = { read: async () => session, write: async value => { session = value; }, clear: async () => { session = null; } };
  const auth = createAuthService(client, authStorage, backendUrl, () => 1000000);
  return {
    auth, client, authStorage, calls, backendUrl,
    login: (id = userId) => auth.login({ identifier: id, password: 'test-password' }),
    creates: () => calls.filter(c => c.query === createHouseholdMutation),
  };
}

test('zero memberships creates My Kitchen in the device timezone, then persists its ID', async () => {
  const h = harness({ memberships: [] }), storage = memoryStorage();
  await h.login();
  const selected = await resolveActiveHousehold(h.auth, storage);
  assert.deepEqual(selected, { id: 'created', name: 'My Kitchen', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  assert.deepEqual(h.creates()[0].variables, { input: { name: 'My Kitchen', timezone: selected.timezone } });
  assert.equal(h.creates().length, 1);
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'created');
  assert(h.calls.every(call => !Object.hasOwn(call.headers, 'x-household-id')));
});

test('one membership is selected without creating a household', async () => {
  const h = harness(), storage = memoryStorage();
  await h.login();
  assert.deepEqual(await resolveActiveHousehold(h.auth, storage), household('one'));
  assert.equal(h.creates().length, 0);
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
});

for (const saved of [null, 'second', 'removed']) {
  test(`many memberships select ${saved === 'second' ? 'the last-used member' : 'the first member'} with saved ID ${saved}`, async () => {
    const h = harness({ memberships: [member('first'), member('second')] }), storage = memoryStorage();
    if (saved) storage.values.set(key(h.backendUrl, 'user-a'), saved);
    await h.login();
    const expected = saved === 'second' ? 'second' : 'first';
    assert.equal((await resolveActiveHousehold(h.auth, storage)).id, expected);
    assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), expected);
    assert.equal(h.creates().length, 0);
  });
}

test('stale saved ID does not prevent creation when no memberships remain', async () => {
  const h = harness({ memberships: [] }), storage = memoryStorage();
  storage.values.set(key(h.backendUrl, 'user-a'), 'removed');
  await h.login();
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'created');
  assert.equal(h.creates().length, 1);
});

test('restoration revalidates the saved ID against current memberships', async () => {
  const h = harness({ memberships: [member('first'), member('second')] }), storage = memoryStorage();
  await h.login();
  storage.values.set(key(h.backendUrl, 'user-a'), 'second');
  const restored = createAuthService(h.client, h.authStorage, h.backendUrl, () => 1000000);
  assert.equal((await resolveActiveHousehold(restored, storage)).id, 'second');
  assert.equal(h.calls.filter(c => c.query === myHouseholdsQuery).length, 1);
  assert.equal(h.creates().length, 0);
});

test('every resolution reloads membership instead of caching a household that was left', async () => {
  let memberships = [member('first'), member('second')];
  const h = harness({ memberships: () => memberships }), storage = memoryStorage();
  await h.login();
  storage.values.set(key(h.backendUrl, 'user-a'), 'second');
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'second');
  memberships = [member('first')];
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'first');
  assert.equal(h.creates().length, 0);
});

test('two concurrent resolutions share one create, including different storage adapters', async () => {
  const entered = deferred(), release = deferred();
  const h = harness({ transport: async call => {
    if (call.query === myHouseholdsQuery) return Response.json({ data: { myHouseholds: [] } });
    entered.resolve();
    await release.promise;
    return Response.json({ data: { createHousehold: 'created-once' } });
  } });
  const a = memoryStorage(), b = memoryStorage();
  await h.login();
  const first = resolveActiveHousehold(h.auth, a);
  await entered.promise;
  const second = resolveActiveHousehold(h.auth, b);
  release.resolve();
  const result = await Promise.all([first, second]);
  assert.deepEqual(result.map(v => v.id), ['created-once', 'created-once']);
  assert.equal(h.creates().length, 1);
  assert.equal(h.calls.filter(c => c.query === myHouseholdsQuery).length, 1);
  for (const storage of [a, b]) assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'created-once');
});

test('selection keys isolate users and backends, even with identical household memberships', async () => {
  const memberships = [member('first'), member('second')], storage = memoryStorage();
  const a = harness({ memberships }), b = harness({ memberships, userId: 'user-b' });
  const c = harness({ memberships, backendUrl: 'https://other.example.invalid' });
  storage.values.set(key(a.backendUrl, 'user-a'), 'second');
  storage.values.set(key(c.backendUrl, 'user-a'), 'second');
  for (const h of [a, b, c]) await h.login();
  assert.equal((await resolveActiveHousehold(a.auth, storage)).id, 'second');
  assert.equal((await resolveActiveHousehold(b.auth, storage)).id, 'first');
  assert.equal((await resolveActiveHousehold(c.auth, storage)).id, 'second');
  await a.auth.logout();
  assert.equal(storage.values.get(key(a.backendUrl, 'user-a')), 'second');
  assert.equal(storage.values.get(key(b.backendUrl, 'user-b')), 'first');
  assert.equal(storage.values.get(key(c.backendUrl, 'user-a')), 'second');
});

test('saved selection survives logout and is reused after the same user signs back in', async () => {
  const h = harness({ memberships: [member('first'), member('second')] }), storage = memoryStorage();
  await h.login();
  storage.values.set(key(h.backendUrl, 'user-a'), 'second');
  await resolveActiveHousehold(h.auth, storage);
  await h.auth.logout();
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'second');
  await h.login();
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'second');
  assert.equal(h.creates().length, 0);
});

test('identity change preserves each user selection without sharing it', async () => {
  const h = harness({ memberships: [member('first'), member('second')] }), storage = memoryStorage();
  await h.login();
  storage.values.set(key(h.backendUrl, 'user-a'), 'second');
  await resolveActiveHousehold(h.auth, storage);
  storage.values.set(key(h.backendUrl, 'user-b'), 'first');
  await h.login('user-b');
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'second');
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'first');
  assert.equal(storage.values.get(key(h.backendUrl, 'user-b')), 'first');
  await h.login('user-a');
  assert.equal((await resolveActiveHousehold(h.auth, storage)).id, 'second');
});

test('token rotation and password reset preserve selection', async () => {
  const h = harness(), storage = memoryStorage();
  await h.login();
  await resolveActiveHousehold(h.auth, storage);
  const revision = h.auth.getIdentityRevision();
  await h.auth.refreshAccessToken();
  assert.equal(h.auth.getIdentityRevision(), revision);
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
  await h.auth.resetPassword('reset-token', 'NewPassword123!');
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
});

test('terminal refresh failure preserves the household selection', async () => {
  const h = harness(), storage = memoryStorage();
  await h.login();
  await resolveActiveHousehold(h.auth, storage);
  // Existing auth storage is cleared before refresh dispatch; make that fail.
  h.authStorage.clear = async () => { throw new Error('Secure storage unavailable'); };
  await assert.rejects(h.auth.refreshAccessToken());
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
});

test('logout during an in-flight create rejects the stale result and never persists it', async () => {
  const entered = deferred(), release = deferred();
  const h = harness({ transport: async call => {
    if (call.query === myHouseholdsQuery) return Response.json({ data: { myHouseholds: [] } });
    entered.resolve();
    await release.promise;
    return Response.json({ data: { createHousehold: 'old-user-household' } });
  } }), storage = memoryStorage();
  await h.login();
  const result = resolveActiveHousehold(h.auth, storage);
  const rejected = assert.rejects(result, ActiveHouseholdError);
  await entered.promise;
  await h.auth.logout();
  release.resolve();
  await rejected;
  assert.equal(storage.values.size, 0);
});

test('account change during membership lookup cannot create or save for the new identity', async () => {
  const entered = deferred(), release = deferred();
  const h = harness({ transport: async () => {
    entered.resolve();
    await release.promise;
    return Response.json({ data: { myHouseholds: [] } });
  } }), storage = memoryStorage();
  await h.login();
  const rejected = assert.rejects(resolveActiveHousehold(h.auth, storage), ActiveHouseholdError);
  await entered.promise;
  await h.login('user-b');
  release.resolve();
  await rejected;
  assert.equal(h.creates().length, 0);
  assert.equal(storage.values.size, 0);
});

test('logout during a pending selection write rejects resolution but preserves the scoped value', async () => {
  const h = harness(), storage = memoryStorage(), entered = deferred(), release = deferred();
  const write = storage.setItem;
  storage.setItem = async (k, v) => { entered.resolve(); await release.promise; await write(k, v); };
  await h.login();
  const resolving = assert.rejects(resolveActiveHousehold(h.auth, storage), ActiveHouseholdError);
  await entered.promise;
  // Logout must finish independently of the household storage write.
  await h.auth.logout();
  release.resolve();
  await resolving;
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
});

for (const failure of ['network', 'backend', 'create']) {
  test(`${failure} failure is explicit, writes nothing and permits an explicit retry`, async () => {
    let failing = true;
    const h = harness({ transport: async call => {
      if (failing) {
        if (failure === 'network') throw new Error('Offline');
        if (failure !== 'create' || call.query === createHouseholdMutation) {
          return Response.json({ errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }] });
        }
      }
      return Response.json({ data: call.query === myHouseholdsQuery
        ? { myHouseholds: failure === 'create' ? [] : [member('one')] } : { createHousehold: 'created' } });
    } }), storage = memoryStorage();
    await h.login();
    await assert.rejects(resolveActiveHousehold(h.auth, storage), error => error instanceof ActiveHouseholdError && !!error.cause);
    assert.equal(storage.values.size, 0);
    failing = false;
    assert.equal((await resolveActiveHousehold(h.auth, storage)).id, failure === 'create' ? 'created' : 'one');
  });
}

test('selection storage failures are reported without creating a household or using local inventory', async () => {
  for (const operation of ['getItem', 'setItem']) {
    const h = harness(), storage = memoryStorage();
    storage[operation] = async () => { throw new Error('Storage unavailable'); };
    await h.login();
    await assert.rejects(resolveActiveHousehold(h.auth, storage), ActiveHouseholdError);
    assert.equal(h.creates().length, 0);
  }
});

test('household storage failures cannot fail login, logout, password reset or rotation', async () => {
  const h = harness(), storage = memoryStorage();
  await h.login();
  await resolveActiveHousehold(h.auth, storage);
  let accesses = 0;
  for (const operation of ['getItem', 'setItem', 'removeItem']) {
    storage[operation] = async () => { accesses++; throw new Error('Storage unavailable'); };
  }
  await h.login('user-b');
  await h.auth.refreshAccessToken();
  await h.auth.resetPassword('reset-token', 'NewPassword123!');
  await h.login();
  await h.auth.logout();
  await assert.rejects(h.auth.getIdentityContext(), { code: 'NO_SESSION' });
  assert.equal(accesses, 0);
  assert.equal(storage.values.get(key(h.backendUrl, 'user-a')), 'one');
});

test('invalid membership responses fail without treating them as zero memberships', async () => {
  for (const memberships of [null, {}, [null], [{ household: {} }]]) {
    const h = harness({ memberships }), storage = memoryStorage();
    await h.login();
    await assert.rejects(resolveActiveHousehold(h.auth, storage), ActiveHouseholdError);
    assert.equal(h.creates().length, 0);
    assert.equal(storage.values.size, 0);
  }
});

test('signed-out resolution fails without querying memberships or creating', async () => {
  const h = harness(), storage = memoryStorage();
  await assert.rejects(resolveActiveHousehold(h.auth, storage), ActiveHouseholdError);
  assert.equal(h.calls.length, 0);
  assert.equal(storage.values.size, 0);
});

test('create operation validates against the generated backend GraphQL schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  assert.deepEqual(validate(schema, parse(createHouseholdMutation)), []);
});
