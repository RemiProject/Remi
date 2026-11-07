const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
function loadApi({ send = async () => ({}), resolve = async () => ({ id: 'household-a' }), authRevision = () => 1, householdRevision = () => 1 } = {}) {
  const exports = {};
  const auth = { getIdentityRevision: authRevision, authenticatedGraphql: send };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/kitchen-api.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => name.includes('async-storage') ? { default: {} } : name === './auth' ? { getAuth: () => auth } : name === './active-household-service' ? { resolveActiveHousehold: resolve, getActiveHouseholdRevision: householdRevision } : require(name), Uint8Array, Date, BigInt, Math, Number, String, Set, Error, crypto: globalThis.crypto });
  return exports;
}
test('portion scaling uses exact thousandths and rejects zero or invalid portions', () => {
  const api = loadApi();
  assert.equal(api.scaleQuantity('0.100', 3, 2), '0.150');
  assert.equal(api.scaleQuantity('1', 1, 3), '0.333');
  assert.equal(api.scaleQuantity('99999999999999.999', 2, 1), '199999999999999.998');
  for (const args of [['0.001', 1, 20], ['-1', 1, 2], ['1', 0, 2], ['1', 2, 0]]) assert.throws(() => api.scaleQuantity(...args));
});
test('household-scoped requests pass the resolved household and reject stale identities', async () => {
  const calls = [];
  const api = loadApi({ send: async (...args) => { calls.push(args); return { ok: true }; } });
  assert.equal((await api.kitchenRequest('query Test', { first: 2 })).ok, true);
  assert.equal(calls[0][2], 'household-a');
  let revision = 1;
  await assert.rejects(loadApi({ authRevision: () => revision, resolve: async () => { revision++; return { id: 'old' }; } }).kitchenRequest('query Test'), /account changed/);
});
test('a response from a household switched during the request is rejected', async () => {
  let householdRevision = 1;
  const api = loadApi({ householdRevision: () => householdRevision, send: async () => { householdRevision++; return { private: 'old household' }; } });
  await assert.rejects(api.kitchenRequest('query Test'), /household changed/);
});
test('recipe pagination loads all pages and rejects a nonadvancing cursor', async () => {
  let page = 0;
  const api = loadApi({ send: async () => ({ recipes: ++page === 1 ? { nodes: [{ id: 'a' }], hasNextPage: true, endCursor: 'next' } : { nodes: [{ id: 'b' }], hasNextPage: false, endCursor: null } }) });
  assert.equal((await api.loadRecipes()).map(value => value.id).join(','), 'a,b');
  await assert.rejects(loadApi({ send: async () => ({ recipes: { nodes: [], hasNextPage: true, endCursor: 'same' } }) }).loadRecipes(), /invalid page/);
});
test('new operation keys differ and date shifting preserves calendar days', () => {
  const api = loadApi(); const keys = Array.from({ length: 100 }, () => api.operationKey());
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(api.shiftDay('2026-12-31', 1), '2027-01-01');
});
function loadHouseholdService(memberships) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/active-household-service.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: () => ({ loadMyHouseholds: async () => memberships }), Map, Set, WeakMap, Promise, Error, JSON, Intl });
  return exports;
}
test('household selection validates membership and namespaces saved choices', async () => {
  const api = loadHouseholdService([{ household: { id: 'allowed', name: 'Home', timezone: 'Africa/Cairo' } }]);
  const auth = { getIdentityContext: async () => ({ userId: 'user-a', backendUrl: 'http://localhost:3100', revision: 1 }), getIdentityRevision: () => 1 };
  const entries = new Map(); const storage = { getItem: async key => entries.get(key) ?? null, setItem: async (key, value) => entries.set(key, value), removeItem: async key => entries.delete(key) };
  let events = 0; const stop = api.subscribeHouseholdSelection(() => events++);
  await assert.rejects(api.setActiveHousehold(auth, storage, 'forbidden'), /not a member/);
  assert.equal(entries.size, 0);
  await api.setActiveHousehold(auth, storage, 'allowed');
  assert.equal([...entries.keys()][0].startsWith('remi.cookbook.active-household.v1:'), true);
  assert.equal([...entries.values()][0], 'allowed'); assert.equal(events, 1); stop();
});
