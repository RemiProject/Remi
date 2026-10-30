const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { BackendStockActionsStore, stockActionOperations, stockTotal } = require('../src/services/backend-stock-actions.ts');
const { inventoryReadOperations } = require('../src/repositories/graphql-inventory-repository.ts');
const { mapInventoryReadItem } = require('../src/domain/backend-inventory-read-model.ts');
const { BackendKitchenStore, emptyBackendKitchen, visibleBackendKitchen } = require('../src/repositories/backend-kitchen-store.ts');
const { BackendError } = require('../src/services/backend-core.ts');
const { parseDecimal, formatDecimal } = require('../src/domain/inventory-decimal.ts');
const { stockActionMessages } = require('../src/i18n/backend-stock-actions.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const raw = { id: 'this-batch', foodId: 'food', foodName: 'tomato', quantity: '2.000', unit: 'KILOGRAM', storageLocation: 'FRIDGE', estimatedExpiryAt: null, version: 1,
  transactions: { nodes: [], hasNextPage: false, endCursor: null } };
const mapped = value => ({ ...mapInventoryReadItem(value, 'Africa/Cairo'), transactions: value.transactions });
const success = (balances = []) => ({ __typename: 'InventoryMutationSuccessType', eventId: 'event', replayed: false, foodId: raw.foodId, quantity: '1.000', unit: raw.unit, balances });

function harness({ mutation, refresh, latest = { ...raw }, item = mapped(raw) } = {}) {
  const calls = [], events = [], values = new Map();
  let revision = 1, household = 'home', keys = 0, refreshes = 0;
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => {
    assert(key.startsWith('remy.active-household.')); values.set(key, value);
  }, removeItem: async () => assert.fail('Never touches local inventory') };
  const auth = {
    getIdentityRevision: () => revision,
    getIdentityContext: async () => ({ userId: 'user', backendUrl: 'http://backend.local', revision }),
    authenticatedGraphql: async (query, variables, householdId) => {
      calls.push({ query, variables, householdId });
      if (query.includes('myHouseholds')) return { myHouseholds: [{ household: { id: household, name: 'Kitchen', timezone: 'Africa/Cairo' } }] };
      if (query === inventoryReadOperations.get) { events.push('get'); assert.equal(variables.id, raw.id); return { inventoryItem: latest }; }
      if (Object.values(stockActionOperations).includes(query)) {
        events.push('mutation');
        if (mutation) return mutation(variables.input, query, latest);
        if ('delta' in variables.input) latest.quantity = formatDecimal(parseDecimal(latest.quantity) + parseDecimal(variables.input.delta, { allowNegative: true }));
        return { result: success([{ inventoryItemId: raw.id, balanceAfter: latest.quantity, quantityDelta: variables.input.delta ?? '-1.000' }]) };
      }
      assert.fail(query);
    },
  };
  const store = new BackendStockActionsStore(auth, storage, item,
    async () => { refreshes++; events.push('refresh'); return refresh ? refresh(latest) : mapped(latest); },
    zero => events.push(zero ? 'updated:kitchen' : 'updated:detail'), () => `key-${++keys}`);
  return { store, auth, storage, calls, events, latest, keys: () => keys, refreshes: () => refreshes,
    mutations: () => calls.filter(call => Object.values(stockActionOperations).includes(call.query)),
    switchIdentity: () => { revision++; }, switchHousehold: () => { household = 'other'; } };
}
const start = (h, action, input = '0.5') => { h.store.open(action); if (action !== 'mistake') h.store.change('input', input); };

for (const action of ['used', 'discard']) {
  test(`${action} sends food ID, positive exact amount, default unit and household; no batch restriction`, async () => {
    const h = harness(); start(h, action, '٠,٧٥');
    assert.equal(h.store.getSnapshot().unit, 'kg');
    assert.equal(await h.store.submit(), true);
    assert.deepEqual(h.mutations()[0], { query: stockActionOperations[action], householdId: 'home', variables: { input: { foodId: 'food', amount: '0.750', unit: 'KILOGRAM', idempotencyKey: 'key-1' } } });
    assert.deepEqual(h.events, ['mutation', 'refresh', 'updated:detail']);
  });
  test(`${action} allows a supported unit change and keeps insufficient input`, async () => {
    const h = harness({ mutation: async () => ({ result: { __typename: 'InsufficientStockType', available: '0.250', unit: 'GRAM' } }) });
    start(h, action, '100'); h.store.change('unit', 'g');
    assert.equal(await h.store.submit(), false);
    assert.equal(h.mutations()[0].variables.input.unit, 'GRAM');
    assert.equal(h.store.getSnapshot().input, '100');
    assert.deepEqual(h.store.getSnapshot().insufficient, { __typename: 'InsufficientStockType', available: '0.250', unit: 'GRAM' });
    assert.equal(h.refreshes(), 0);
  });
}

for (const [current, desired, delta] of [['1.250', '2', '0.750'], ['3.750', '٢,٥', '-1.250'], ['2.000', '0', '-2.000']]) {
  test(`Fix count refetches before delta: ${desired} minus ${current} = ${delta}`, async () => {
    const h = harness({ latest: { ...raw, quantity: current } }); start(h, 'fix', desired);
    assert.equal(await h.store.submit(), true);
    assert.deepEqual(h.mutations()[0].variables.input, { inventoryItemId: raw.id, delta, idempotencyKey: 'key-1' });
    assert.equal(h.mutations()[0].query, stockActionOperations.fix);
    assert.deepEqual(h.events.slice(0, 2), ['get', 'mutation']);
    assert.equal(h.events.at(-1), desired === '0' ? 'updated:kitchen' : 'updated:detail');
  });
}
test('Fix count unchanged after fresh read is a no-op: no key, mutation, refresh or success banner', async () => {
  const h = harness({ latest: { ...raw, quantity: '3.500' } }); start(h, 'fix', '٣,٥');
  assert.equal(await h.store.submit(), false); assert.equal(h.store.getSnapshot().unchanged, true);
  assert.deepEqual(h.events, ['get']); assert.equal(h.keys(), 0);
});
test('Added by mistake requires confirmation, refetches, and zeros only this batch', async () => {
  const h = harness({ latest: { ...raw, quantity: '1.125' } }); start(h, 'mistake');
  assert.equal(await h.store.submit(), false); assert.equal(h.calls.length, 0);
  h.store.cancel(); assert.equal(await h.store.submit(true), false);
  start(h, 'mistake'); assert.equal(await h.store.submit(true), true);
  assert.deepEqual(h.mutations()[0].variables.input, { inventoryItemId: raw.id, delta: '-1.125', idempotencyKey: 'key-1' });
  assert.equal(h.mutations()[0].query, stockActionOperations.mistake);
  assert.equal(h.events.at(-1), 'updated:kitchen');
});

for (const action of ['used', 'discard', 'fix', 'mistake']) {
  test(`${action}: timeout after commit retries frozen payload/key once; new success/input starts new key`, async () => {
    const committed = new Map(); let first = true;
    const h = harness({ mutation: async (input, _query, latest) => {
      if (!committed.has(input.idempotencyKey)) {
        committed.set(input.idempotencyKey, { ...input });
        if ('delta' in input) latest.quantity = formatDecimal(parseDecimal(latest.quantity) + parseDecimal(input.delta, { allowNegative: true }));
      }
      if (first) { first = false; throw new Error('Timeout after commit'); }
      return { result: { ...success(), replayed: true } };
    } });
    start(h, action, action === 'fix' ? '1' : '0.5');
    assert.equal(await h.store.submit(action === 'mistake'), false);
    assert.equal(await h.store.submit(action === 'mistake'), true);
    assert.equal(committed.size, 1); assert.equal(h.keys(), 1);
    assert.equal(h.mutations()[0].variables.input, h.mutations()[1].variables.input);
    assert(Object.isFrozen(h.mutations()[0].variables.input));
    if (action === 'fix' || action === 'mistake') assert.equal(h.events.filter(event => event === 'get').length, 1, 'retry must not recompute the delta');
    if (action === 'mistake') h.latest.quantity = '2.000';
    start(h, action, action === 'fix' ? '3' : '0.5');
    await h.store.submit(action === 'mistake'); assert.equal(h.keys(), 2);
  });
}
test('input, unit and action changes after failure start new operations', async () => {
  for (const change of [store => store.change('input', '0.75'), store => store.change('unit', 'g'), store => store.open('discard')]) {
    const h = harness({ mutation: async () => { throw new Error('Offline'); } }); start(h, 'used', '1'); await h.store.submit();
    change(h.store); if (!h.store.getSnapshot().input) h.store.change('input', '1');
    await h.store.submit(); assert.equal(h.keys(), 2);
    assert.notEqual(h.mutations()[0].variables.input.idempotencyKey, h.mutations()[1].variables.input.idempotencyKey);
  }
});
test('confirmed mutation with failed refresh retries refresh only and retains the draft', async () => {
  let fail = true;
  const h = harness({ refresh: async latest => { if (fail) throw new Error('Offline'); return mapped(latest); } }); start(h, 'fix', '1');
  await h.store.submit();
  assert.equal(h.store.getSnapshot().refreshPending, true); assert.equal(h.store.getSnapshot().input, '1');
  h.store.change('input', '9'); h.store.open('discard'); h.store.cancel();
  assert.equal(h.store.getSnapshot().action, 'fix'); assert.equal(h.store.getSnapshot().input, '1');
  fail = false; assert.equal(await h.store.submit(), true);
  assert.equal(h.mutations().length, 1); assert.equal(h.refreshes(), 2);
});
test('concurrent save cannot dispatch twice or change a busy attempt', async () => {
  const result = deferred(), h = harness({ mutation: () => result.promise }); start(h, 'used');
  const pending = h.store.submit(); await tick(); assert.equal(await h.store.submit(), false);
  h.store.change('input', '9'); h.store.cancel(); assert.equal(h.store.getSnapshot().input, '0.5');
  result.resolve({ result: success() }); assert.equal(await pending, true); assert.equal(h.mutations().length, 1);
});
for (const action of ['used', 'discard', 'fix', 'mistake']) {
  test(`read-only ${action} cannot open or send a mutation`, async () => {
    for (const overrides of [{ unit: 'TABLESPOON' }, { unit: 'TEASPOON' }, { storageLocation: 'COUNTER' }, { storageLocation: 'OTHER' }]) {
      const h = harness({ item: mapped({ ...raw, ...overrides }) }); start(h, action);
      assert.equal(h.store.getSnapshot().action, null); assert.equal(await h.store.submit(true), false); assert.equal(h.calls.length, 0);
    }
  });
}
test('a fresh adjustment read that becomes unsupported is rejected', async () => {
  const h = harness({ latest: { ...raw, storageLocation: 'COUNTER' } }); start(h, 'fix', '1');
  await h.store.submit(); assert.equal(h.store.getSnapshot().error.code, 'READ_ONLY'); assert.equal(h.mutations().length, 0);
});
for (const input of ['0', '-1', '1.2345', '١,٢٣٤٥', 'NaN', 'Infinity', '1e3', '', '1,2.3']) {
  test(`Used/discard reject invalid amount ${JSON.stringify(input)}`, async () => {
    for (const action of ['used', 'discard']) {
      const h = harness(); start(h, action, input); assert.equal(await h.store.submit(), false); assert.equal(h.store.getSnapshot().validation, true); assert.equal(h.calls.length, 0);
    }
  });
}
test('correct totals accept exact Arabic zero and decimals but reject precision loss and negatives', () => {
  assert.equal(stockTotal('٠'), '0.000'); assert.equal(stockTotal('۰,۷۵'), '0.750');
  for (const input of ['-1', '1.2345', '١,٢٣٤٥', 'NaN', 'Infinity']) assert.throws(() => stockTotal(input));
});
test('identity and household changes discard late writes and prevent a retry in the wrong household', async () => {
  const result = deferred(), h = harness({ mutation: () => result.promise }); start(h, 'used');
  const saving = h.store.submit(); await tick(); h.switchIdentity(); result.resolve({ result: success() });
  assert.equal(await saving, false); assert.equal(h.store.getSnapshot().error.code, 'STALE_CONTEXT'); assert.equal(h.refreshes(), 0);
  const other = harness({ mutation: async () => { throw new Error('Offline'); } }); start(other, 'used'); await other.store.submit();
  other.switchHousehold(); await other.store.submit(); assert.equal(other.mutations().length, 1); assert.equal(other.store.getSnapshot().error.code, 'STALE_CONTEXT');
});
test('all three mutation documents validate against the actual backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const operation of Object.values(stockActionOperations)) assert.deepEqual(validate(schema, parse(operation)), []);
});

// Test the real backend domain conversion and FEFO rules without starting a server.
const backendDomain = require('../../backend/src/shared/domain-error.ts');
const units = require('../../backend/src/shared/food-unit.ts');
const converted = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('../backend/src/modules/units/domain/unit-converter.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(id => id === '@/shared/domain-error.js' ? backendDomain : id === './unit.js' ? units : require(id), converted);
const { allocateFefo } = require('../../backend/src/modules/inventory/domain/fefo-allocator.ts');
test('actual backend converter supports kg/g and piece/kg with factors, rejects missing factors', () => {
  assert.equal(converted.convertQuantity('1', units.Unit.KILOGRAM, units.Unit.GRAM, {}), '1000.000');
  assert.equal(converted.convertQuantity('2', units.Unit.PIECE, units.Unit.KILOGRAM, { gramsPerPiece: '150' }), '0.300');
  assert.throws(() => converted.convertQuantity('2', units.Unit.PIECE, units.Unit.KILOGRAM, {}), error => error.code === 'UNIT_NOT_CONVERTIBLE');
});
for (const action of ['used', 'discard']) {
  test(`${action} FEFO can consume an earlier batch and leave the displayed batch unchanged`, async () => {
    const h = harness({ mutation: async input => {
      const allocation = allocateFefo(input.amount, [{ id: raw.id, quantity: '2.000', estimatedExpiryAt: new Date('2026-12-01') }, { id: 'earlier', quantity: '1.000', estimatedExpiryAt: new Date('2026-11-01') }]);
      assert.deepEqual(allocation, [{ id: 'earlier', amount: '0.500' }]);
      return { result: success([{ inventoryItemId: 'earlier', balanceAfter: '0.500', quantityDelta: '-0.500' }]) };
    } }); start(h, action); assert.equal(await h.store.submit(), true);
    assert.equal(h.latest.quantity, '2.000'); assert.equal(h.events.at(-1), 'updated:detail');
  });
  test(`${action} returns to Kitchen if the refreshed displayed batch reaches zero`, async () => {
    const h = harness({ mutation: async (_input, _query, latest) => {
      latest.quantity = '0.000'; return { result: success([{ inventoryItemId: raw.id, quantityDelta: '-2.000', balanceAfter: '0.000' }]) };
    } }); start(h, action, '2');
    assert.equal(await h.store.submit(), true);
    assert.equal(h.events.at(-1), 'updated:kitchen'); assert.equal(h.refreshes(), 1);
  });
}

test('a household switch after opening detail but before the first submit cannot target the new household', async () => {
  const { resolveActiveHousehold } = require('../src/services/active-household-service.ts');
  const h = harness(); await resolveActiveHousehold(h.auth, h.storage);
  const store = new BackendStockActionsStore(h.auth, h.storage, mapped(raw), async () => mapped(raw), () => assert.fail('No success'));
  store.open('used'); store.change('input', '1'); h.switchHousehold();
  assert.equal(await store.submit(), false); assert.equal(store.getSnapshot().error.code, 'STALE_CONTEXT'); assert.equal(h.mutations().length, 0);
});

test('stock refresh updates list/detail together, supports zero, and never publishes stale account data', async () => {
  const response = deferred(); let pending = false;
  const store = new BackendKitchenStore(() => ({ list: async () => pending ? response.promise : { items: [mapped(raw)], today: '2026-11-01' }, get: async () => mapped({ ...raw, quantity: '0.000' }) }));
  store.setUser('a'); await tick(); await store.loadDetail(raw.id);
  const detail = await store.refreshStock(raw.id);
  assert.equal(detail.quantity, '0.000'); assert.equal(store.getSnapshot().detail.item.quantity, '0.000');
  store.showUpdated(); assert.equal(store.getSnapshot().additionNoticeKind, 'updated');
  pending = true; const refresh = store.refreshStock(raw.id); store.setUser(null);
  response.resolve({ items: [], today: '2026-11-01' }); await assert.rejects(refresh, /changed/);
  assert.deepEqual(store.getSnapshot(), emptyBackendKitchen);
  assert.equal(visibleBackendKitchen(store.getSnapshot(), null, false).additionNotice, null);
});
test('background list failure keeps a mounted stock draft detail, but stale context clears it', async () => {
  let fail;
  const store = new BackendKitchenStore(() => ({ list: async () => { if (fail) throw fail; return { items: [mapped(raw)], today: '2026-11-01' }; }, get: async () => mapped(raw) }));
  store.setUser('a'); await tick(); await store.loadDetail(raw.id);
  fail = new Error('Offline'); await store.reload(); assert.equal(store.getSnapshot().detail.status, 'ready');
  await assert.rejects(store.refreshStock(raw.id), /Offline/); assert.equal(store.getSnapshot().detail.status, 'ready');
  fail = Object.assign(new Error('Changed household'), { code: 'STALE_CONTEXT' }); await store.reload(); assert.equal(store.getSnapshot().detail, null);
});

function uiHarness({ language = 'en', item = mapped(raw), ...options } = {}) {
  const h = harness({ item, ...options }), slots = [], effects = [], events = [];
  let cursor = 0, store;
  const jsx = require('react/jsx-runtime'), exported = {};
  const code = ts.transpileModule(fs.readFileSync('src/components/backend-stock-actions.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(id => {
    if (id === 'react') return {
      useEffect: effect => effects.push(effect), useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = value; }]; },
    };
    if (id === 'react/jsx-runtime') return jsx;
    if (id === 'expo-router') return { router: { replace: path => events.push(path) } };
    if (id === 'react-native') return { Modal: 'Modal', ScrollView: 'ScrollView', View: 'View' };
    if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: h.storage };
    if (id === '@/components/ui/core') return { ...Object.fromEntries(['AppText', 'Button', 'Card', 'Chip', 'ScreenDirectionProvider'].map(name => [name, name])), uiStyles: {} };
    if (id === '@/components/ui/form-field') return { FieldGroup: 'FieldGroup', FormField: 'FormField' };
    if (id === '@/providers/backend-kitchen-provider') return { useBackendKitchen: () => ({
      refreshStock: async id => { assert.equal(id, raw.id); events.push('refresh'); return options.refresh ? options.refresh(h.latest) : mapped(h.latest); },
      showUpdated: () => events.push('updated'),
    }) };
    if (id === '@/providers/language-provider') return { useLanguage: () => ({ language }) };
    if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: { errorText: 'red' } }) };
    if (id === '@/theme/tokens') return { spacing: {} };
    if (id === '@/services/auth') return { getAuth: () => h.auth };
    if (id === '@/services/backend-stock-actions') return { BackendStockActionsStore: class extends BackendStockActionsStore {
      constructor(...args) { super(...args); store = this; }
    } };
    if (id.startsWith('@/')) return require(`../src/${id.slice(2)}.ts`);
    return require(id);
  }, exported);
  const expand = node => Array.isArray(node) ? node.map(expand) : !node || typeof node !== 'object' ? node
    : typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } };
  const nodes = (node, type) => Array.isArray(node) ? node.flatMap(n => nodes(n, type)) : !node || typeof node !== 'object' ? []
    : [...(node.type === type ? [node] : []), ...nodes(node.props.children, type)];
  return { ...h, events, nodes, effects, store: () => store, render: () => { cursor = 0; return expand(exported.BackendStockActions({ item })); } };
}
const button = (h, label) => h.nodes(h.render(), 'Button').find(node => node.props.label === label);
for (const language of ['en', 'ar']) {
  test(`${language}: four stock actions, FEFO hint even for one batch, correct unit default and supported choices`, () => {
    const h = uiHarness({ language }), t = stockActionMessages[language], tree = h.render();
    for (const action of ['used', 'discard', 'fix', 'mistake']) assert.equal(button(h, t[action]).props.disabled, false);
    assert.equal(h.nodes(tree, 'AppText').filter(node => node.props.children === t.fefo).length, 2);
    button(h, t.used).props.onPress();
    assert.equal(h.nodes(h.render(), 'Modal')[0].props.visible, true);
    assert(h.nodes(h.render(), 'Chip').find(node => node.props.selected).props.label);
    assert.equal(h.store().getSnapshot().unit, 'kg'); assert.equal(h.nodes(h.render(), 'Chip').length, 6);
    const input = h.nodes(h.render(), 'FormField')[0]; input.props.onChangeText('١,٢٥');
    assert.equal(h.store().getSnapshot().input, '١,٢٥');
    h.nodes(h.render(), 'Chip')[0].props.onPress(); assert.equal(h.store().getSnapshot().unit, 'g');
  });
  test(`${language}: unsupported unit/storage disables all four actions`, () => {
    for (const overrides of [{ unit: 'TABLESPOON' }, { storageLocation: 'COUNTER' }]) {
      const h = uiHarness({ language, item: mapped({ ...raw, ...overrides }) });
      for (const action of ['used', 'discard', 'fix', 'mistake']) assert.equal(button(h, stockActionMessages[language][action]).props.disabled, true);
    }
  });
  test(`${language}: insufficient stock retains input and displays available amount`, async () => {
    const h = uiHarness({ language, mutation: async () => ({ result: { __typename: 'InsufficientStockType', available: '0.250', unit: 'KILOGRAM' } }) }), t = stockActionMessages[language];
    button(h, t.discard).props.onPress(); h.nodes(h.render(), 'FormField')[0].props.onChangeText('5');
    button(h, t.save).props.onPress(); await tick();
    assert.equal(h.store().getSnapshot().input, '5');
    assert(h.nodes(h.render(), 'AppText').some(node => node.props.accessibilityRole === 'alert' && node.props.children.includes('0.25')), JSON.stringify(h.store().getSnapshot()));
    assert.deepEqual(h.events, []);
  });
  test(`${language}: unit conversion failure has a clear localized message and preserves input`, async () => {
    const h = uiHarness({ language, mutation: async () => {
      try { converted.convertQuantity('1', units.Unit.PIECE, units.Unit.KILOGRAM, {}); }
      catch (error) { throw new BackendError(error.message, undefined, [error.code]); }
    } }), t = stockActionMessages[language];
    button(h, t.used).props.onPress(); h.store().change('input', '1'); h.store().change('unit', 'pieces');
    button(h, t.save).props.onPress(); await tick();
    assert(h.nodes(h.render(), 'AppText').some(node => node.props.children === t.unitMismatch));
    assert.equal(h.store().getSnapshot().input, '1'); assert.equal(h.events.length, 0);
  });
  test(`${language}: mistake dialog can cancel; confirming zeros batch, refreshes and navigates with Updated`, async () => {
    const h = uiHarness({ language }), t = stockActionMessages[language];
    button(h, t.mistake).props.onPress();
    assert(h.nodes(h.render(), 'AppText').some(node => node.props.children === t.confirmTitle));
    assert.equal(h.mutations().length, 0); button(h, t.cancel).props.onPress();
    assert.equal(h.nodes(h.render(), 'Modal')[0].props.visible, false);
    button(h, t.mistake).props.onPress(); button(h, t.confirm).props.onPress(); await tick();
    assert.equal(h.mutations()[0].variables.input.delta, '-2.000');
    assert.deepEqual(h.events, ['refresh', 'updated', '/kitchen']);
  });
  test(`${language}: nonzero action stays on detail; failed refresh retries only refresh`, async () => {
    let fail = true;
    const h = uiHarness({ language, refresh: async latest => { if (fail) throw new Error('Offline'); return mapped(latest); } }), t = stockActionMessages[language];
    button(h, t.used).props.onPress(); h.store().change('input', '1'); button(h, t.save).props.onPress(); await tick();
    assert(h.nodes(h.render(), 'AppText').some(node => node.props.children === t.refreshError));
    assert.equal(h.nodes(h.render(), 'FormField')[0].props.editable, false);
    fail = false; button(h, t.retry).props.onPress(); await tick();
    assert.equal(h.mutations().length, 1); assert.deepEqual(h.events, ['refresh', 'refresh', 'updated']);
  });
}
test('English/Arabic stock labels have matching keys and the agreed action wording', () => {
  assert.deepEqual(Object.keys(stockActionMessages.en), Object.keys(stockActionMessages.ar));
  assert.deepEqual(['used', 'discard', 'fix', 'mistake'].map(key => stockActionMessages.ar[key]), ['استخدمت', 'رميت', 'صحّح العدد', 'اتضاف غلط']);
});
