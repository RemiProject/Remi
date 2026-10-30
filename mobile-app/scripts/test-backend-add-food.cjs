const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { BackendAddFoodStore, addFoodOperations, addFoodQuantity, catalogChoiceName } = require('../src/services/backend-add-food.ts');
const { inventoryEndOfDay } = require('../src/domain/inventory-day.ts');
const { backendAddFoodMessages } = require('../src/i18n/backend-add-food.ts');
const { foodEntryMessages } = require('../src/i18n/food-entry.ts');
const { backendKitchenMessages } = require('../src/i18n/backend-kitchen.ts');
const food = { id: 'catalog-tomato', name: 'tomato', defaultUnit: 'KILOGRAM', aliases: [
  { alias: 'بندورة', languageCode: 'ar', isPrimary: false }, { alias: 'طماطم', languageCode: 'ar', isPrimary: true },
] };
const success = { __typename: 'InventoryMutationSuccessType', replayed: false, eventId: 'event', foodId: food.id, quantity: '2.000', unit: 'KILOGRAM', balances: [{ inventoryItemId: 'batch', quantityDelta: '2.000', balanceAfter: '2.000' }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function harness({ search, add, timezone = 'Africa/Cairo' } = {}) {
  const calls = [], values = new Map();
  let revision = 1, keys = 0, householdId = 'home';
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async () => assert.fail('Must never remove inventory/selection') };
  const auth = {
    getIdentityRevision: () => revision,
    getIdentityContext: async () => ({ revision, userId: 'user', backendUrl: 'http://api.local' }),
    authenticatedGraphql: async (query, variables, household) => {
      calls.push({ query, variables, household });
      if (query.includes('myHouseholds')) return { myHouseholds: [{ household: { id: householdId, name: 'Kitchen', timezone } }] };
      if (query === addFoodOperations.search) return search ? search(variables) : { foods: { nodes: [food], hasNextPage: false, endCursor: null } };
      if (query === addFoodOperations.add) return add ? add(variables.input, household) : { addStock: success };
      assert.fail(`Unexpected query ${query}`);
    },
  };
  const store = new BackendAddFoodStore(auth, storage, () => `key-${++keys}`);
  return { store, auth, storage, calls, keys: () => keys, switchUser: () => { revision++; }, switchHousehold: () => { householdId = 'other'; }, mutations: () => calls.filter(call => call.query === addFoodOperations.add) };
}
function fill(store) {
  store.change('search', 'tomato'); store.select(food);
  store.change('quantity', '2');
  return store;
}

test('catalog search debounces, searches Arabic aliases, selects default unit, and editing clears selection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.store.change('search', 'طم');
  t.mock.timers.tick(250);
  h.store.change('search', 'طماطم');
  t.mock.timers.tick(299);
  assert.equal(h.calls.length, 0);
  t.mock.timers.tick(1); await tick();
  assert.equal(h.calls[0].variables.search, 'طماطم');
  assert.deepEqual(h.store.getSnapshot().results, [food]);
  h.store.select(food);
  assert.equal(h.store.getSnapshot().draft.unit, 'kg');
  assert.equal(catalogChoiceName(food, 'ar'), 'طماطم');
  assert.equal(catalogChoiceName(food, 'en'), 'Tomato');
  assert.equal(catalogChoiceName({ ...food, aliases: [] }, 'ar'), 'tomato');
  h.store.change('search', 'another');
  assert.equal(h.store.getSnapshot().draft.food, null);
  h.store.dispose();
});

test('unsupported catalog default requires a supported unit; never maps it or offers packs', async () => {
  const h = harness();
  fill(h.store).select({ ...food, defaultUnit: 'TABLESPOON' });
  assert.equal(h.store.getSnapshot().draft.unit, '');
  assert.equal(await h.store.submit(), false);
  assert.equal(h.store.getSnapshot().errors.unit, 'required');
  h.store.change('unit', 'packs');
  assert.equal(await h.store.submit(), false);
  assert.equal(h.mutations().length, 0);
});

test('no matches keeps quantity, storage and dates; no selection prevents save', async () => {
  const h = harness({ search: async () => ({ foods: { nodes: [], hasNextPage: false, endCursor: null } }) });
  fill(h.store).change('storage', 'pantry');
  h.store.change('expiryDay', '2026-10-30');
  h.store.change('purchaseDate', '2026-10-29');
  h.store.change('search', 'no matches');
  const draft = h.store.getSnapshot().draft;
  await h.store.search();
  assert.deepEqual(h.store.getSnapshot().draft, draft);
  assert.equal(h.store.getSnapshot().searchStatus, 'ready');
  assert.deepEqual(h.store.getSnapshot().results, []);
  assert.equal(await h.store.submit(), false);
  assert.equal(h.mutations().length, 0);
});

test('catalog pagination is available, and late searches cannot replace newer results or a selection', async () => {
  const late = deferred();
  const h = harness({ search: async ({ search, after }) => search === 'old' ? late.promise : {
    foods: { nodes: [{ ...food, id: after ? 'second' : 'first' }], hasNextPage: !after, endCursor: after ? null : 'cursor' },
  } });
  h.store.change('search', 'old'); const request = h.store.search();
  h.store.change('search', 'new'); await h.store.search();
  await h.store.search(true);
  assert.deepEqual(h.store.getSnapshot().results.map(f => f.id), ['first', 'second']);
  h.store.select(food);
  late.resolve({ foods: { nodes: [], hasNextPage: false, endCursor: null } }); await request;
  assert.equal(h.store.getSnapshot().draft.food.id, food.id);
  assert.equal(h.store.getSnapshot().searchStatus, 'idle');
});

test('catalog failures keep the draft and allow an explicit retry', async () => {
  let failed = true;
  const h = harness({ search: async () => { if (failed) throw new Error('Offline'); return { foods: { nodes: [food], hasNextPage: false, endCursor: null } }; } });
  h.store.change('quantity', '3'); h.store.change('search', 'tomato');
  await h.store.search();
  assert.equal(h.store.getSnapshot().searchStatus, 'error');
  assert.equal(h.store.getSnapshot().draft.quantity, '3');
  failed = false; await h.store.search();
  assert.deepEqual(h.store.getSnapshot().results, [food]);
});

for (const [input, expected] of [['١,٢٥', '1.250'], ['۰٫۷۵', '0.750'], ['2,001', '2.001'], ['0.001', '0.001'], [' ٢.٥ ', '2.500'], ['999999999.999', '999999999.999']]) {
  test(`quantity normalizes ${input} exactly`, () => assert.equal(addFoodQuantity(input), expected));
}
for (const input of ['', '0', '٠,٠٠٠', '-1', 'NaN', 'Infinity', '1e3', '1.2345', '١,٢٣٤٥', '1,2.3', '1 000', '1000000000']) {
  test(`quantity rejects ${JSON.stringify(input)}`, () => assert.throws(() => addFoodQuantity(input)));
}

for (const [day, timezone, expected] of [
  ['2026-07-01', 'Africa/Cairo', '2026-07-01T20:59:59.000Z'],
  ['2026-12-01', 'Africa/Cairo', '2026-12-01T21:59:59.000Z'],
  ['2026-03-08', 'America/New_York', '2026-03-09T03:59:59.000Z'],
  ['2026-11-01', 'America/New_York', '2026-11-02T04:59:59.000Z'],
]) {
  test(`expiry ${day} is end of local day in ${timezone}`, () => assert.equal(inventoryEndOfDay(day, timezone), expected));
}
test('expiry rejects invalid days/zones and a skipped calendar day', () => {
  for (const date of ['2026-02-29', '2026-13-01', '2026-1-01']) assert.throws(() => inventoryEndOfDay(date, 'Africa/Cairo'));
  assert.throws(() => inventoryEndOfDay('2026-10-30', 'Invalid/Zone'));
  assert.throws(() => inventoryEndOfDay('2011-12-30', 'Pacific/Apia'));
});

test('add uses household header, exact Decimal, LocalDate purchase and timezone expiry; omitted dates stay omitted', async () => {
  const h = harness(); fill(h.store);
  h.store.change('quantity', '٠,٧٥'); h.store.change('storage', 'pantry');
  h.store.change('purchaseDate', '2026-07-01'); h.store.change('expiryDay', '2026-07-02');
  assert.equal(await h.store.submit(), true);
  assert.deepEqual(h.mutations()[0], { query: addFoodOperations.add, household: 'home', variables: { input: {
    foodId: food.id, amount: '0.750', unit: 'KILOGRAM', storageLocation: 'PANTRY', purchaseDate: '2026-07-01', estimatedExpiryAt: '2026-07-02T20:59:59.000Z', idempotencyKey: 'key-1',
  } } });
  fill(h.store); await h.store.submit();
  assert.equal(h.mutations()[1].variables.input.purchaseDate, undefined);
  assert.equal(h.mutations()[1].variables.input.estimatedExpiryAt, undefined);
  assert.deepEqual(Object.keys(h.mutations()[1].variables.input).sort(), ['amount', 'foodId', 'idempotencyKey', 'storageLocation', 'unit']);
});

test('timeout after committed add reuses the identical key and frozen payload; only one batch is created', async () => {
  const batches = new Map(); let first = true;
  const h = harness({ add: async input => {
    const replayed = batches.has(input.idempotencyKey);
    if (!replayed) batches.set(input.idempotencyKey, { ...input });
    if (first) { first = false; throw new Error('Network timeout after server commit'); }
    return { addStock: { ...success, replayed } };
  } });
  fill(h.store);
  const before = h.store.getSnapshot().draft;
  assert.equal(await h.store.submit(), false);
  assert.equal(h.store.getSnapshot().error.message, 'Network timeout after server commit');
  assert.deepEqual(h.store.getSnapshot().draft, before);
  assert.equal(await h.store.submit(), true);
  assert.equal(batches.size, 1); assert.equal(h.keys(), 1);
  assert.equal(h.mutations()[0].variables.input, h.mutations()[1].variables.input);
  assert(Object.isFrozen(h.mutations()[0].variables.input));
  fill(h.store); assert.equal(await h.store.submit(), true);
  assert.equal(h.keys(), 2); assert.equal(batches.size, 2);
});

test('every changed field after failure starts a new operation even if changed back', async () => {
  for (const [field, value] of [['quantity', '3'], ['unit', 'g'], ['storage', 'freezer'], ['purchaseDate', '2026-07-01'], ['expiryDay', '2026-07-02'], ['search', 'new']]) {
    const h = harness({ add: async () => { throw new Error('Offline'); } }); fill(h.store);
    await h.store.submit();
    const original = h.store.getSnapshot().draft[field];
    h.store.change(field, value); h.store.change(field, original);
    if (field === 'search') h.store.select(food);
    await h.store.submit();
    assert.equal(h.keys(), 2, field);
    assert.notEqual(h.mutations()[0].variables.input.idempotencyKey, h.mutations()[1].variables.input.idempotencyKey);
  }
});

test('concurrent saves send once, disable changes while saving, and backend errors keep form', async () => {
  const response = deferred(), h = harness({ add: () => response.promise }); fill(h.store);
  const pending = h.store.submit(); await tick();
  assert.equal(h.store.getSnapshot().saving, true);
  assert.equal(await h.store.submit(), false);
  h.store.change('quantity', '8');
  assert.equal(h.store.getSnapshot().draft.quantity, '2');
  response.reject(new Error('Backend rejected'));
  assert.equal(await pending, false);
  assert.equal(h.store.getSnapshot().saving, false);
  assert.equal(h.mutations().length, 1);
});

test('invalid quantity/storage/dates reject before mutation and preserve all fields', async () => {
  const h = harness(); fill(h.store);
  h.store.change('quantity', '1.2345'); h.store.change('storage', 'COUNTER');
  h.store.change('purchaseDate', 'bad'); h.store.change('expiryDay', '2026-02-30');
  const before = h.store.getSnapshot().draft;
  assert.equal(await h.store.submit(), false);
  assert.deepEqual(h.store.getSnapshot().draft, before);
  assert.deepEqual(Object.keys(h.store.getSnapshot().errors).sort(), ['expiryDay', 'purchaseDate', 'quantity', 'storage']);
  h.store.change('purchaseDate', '2026-07-02'); h.store.change('expiryDay', '2026-07-01');
  await h.store.submit(); assert.equal(h.store.getSnapshot().errors.expiryDay, 'dateOrder');
  assert.equal(h.mutations().length, 0);
});

test('identity/household changes cannot retry a previous account or household operation', async () => {
  const h = harness({ add: async () => { throw new Error('Offline'); } }); fill(h.store); await h.store.submit();
  h.switchHousehold();
  assert.equal(await h.store.submit(), false);
  assert.match(h.store.getSnapshot().error.message, /household changed/);
  assert.equal(h.mutations().length, 1);
  assert.equal(await h.store.submit(), false);
  assert.equal(h.mutations()[1].household, 'other');
  assert.equal(h.mutations()[1].variables.input.idempotencyKey, 'key-2');
  h.switchUser(); await h.store.submit();
  assert.equal(h.mutations().length, 2);
  assert.match(h.store.getSnapshot().error.message, /account changed/);
});

test('identity change during mutation discards success and keeps it out of the next account', async () => {
  const response = deferred(), h = harness({ add: () => response.promise }); fill(h.store);
  const saving = h.store.submit(); await tick(); h.switchUser();
  response.resolve({ addStock: success });
  assert.equal(await saving, false);
  assert.match(h.store.getSnapshot().error.message, /account changed/);
});

test('catalog and mutation documents validate against the current GraphQL schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const operation of Object.values(addFoodOperations)) assert.deepEqual(validate(schema, parse(operation)), []);
});

function uiHarness({ language = 'en', signedIn = true, ...options } = {}) {
  const h = harness(options), slots = [], effects = [], events = [];
  let cursor = 0, authReady = true, user = signedIn ? { id: 'user' } : null;
  const refresh = deferred();
  const exported = {}, jsx = require('react/jsx-runtime');
  const names = ['ActionRow', 'AppText', 'Button', 'Card', 'Chip', 'EmptyState', 'PageHeader', 'Screen'];
  const code = ts.transpileModule(fs.readFileSync('src/screens/backend-add-food-screen.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)(id => {
    if (id === 'react') return {
      useEffect: effect => effects.push(effect), useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = value; }]; },
      useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    };
    if (id === 'react/jsx-runtime') return jsx;
    if (id === 'expo-router') return { router: { replace: path => events.push(path), push: path => events.push(path) } };
    if (id === 'react-native') return { View: 'View' };
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: h.storage };
    if (id === '@/components/ui/core') return { ...Object.fromEntries(names.map(n => [n, n])), uiStyles: {} };
    if (id === '@/components/ui/form-field') return { FieldGroup: 'FieldGroup', FormField: 'FormField' };
    if (id === '@/providers/auth-provider') return { useAuth: () => ({ user, ready: authReady, busy: false }) };
    if (id === '@/providers/backend-kitchen-provider') return { useBackendKitchen: () => ({ showAdded: () => events.push('added'), retry: async () => { events.push('refresh'); await refresh.promise; events.push('refreshed'); } }) };
    if (id === '@/providers/language-provider') return { useLanguage: () => ({ language }) };
    if (id === '@/services/auth') return { getAuth: () => h.auth };
    if (id === '@/services/backend-add-food') return { BackendAddFoodStore: class { constructor() { return h.store; } }, catalogChoiceName };
    if (id.startsWith('@/')) return require(`../src/${id.slice(2)}.ts`);
    return require(id);
  }, exported);
  const expand = node => Array.isArray(node) ? node.map(expand) : !node || typeof node !== 'object' ? node
    : typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children), action: expand(node.props.action) } };
  const nodes = (node, type) => Array.isArray(node) ? node.flatMap(n => nodes(n, type)) : !node || typeof node !== 'object' ? []
    : [...(node.type === type ? [node] : []), ...nodes(node.props.children, type), ...nodes(node.props.action, type)];
  return { ...h, events, refresh, nodes, effects, render: () => { cursor = 0; return expand(exported.default()); }, signedOut: () => { user = null; }, loading: () => { authReady = false; } };
}

test('English/Arabic form has only supported units/storage, no notes/photos; other methods disabled', () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness({ language }), tree = h.render(), f = foodEntryMessages[language], t = backendAddFoodMessages[language];
    const chips = h.nodes(tree, 'Chip');
    assert.equal(chips.length, 9);
    assert.equal(h.nodes(tree, 'FormField').length, 4);
    assert(h.nodes(tree, 'FormField').every(n => ![f.notes, f.notesOptional, f.photo].includes(n.props.label)));
    const methods = h.nodes(tree, 'Button').filter(n => n.props.label.endsWith(t.comingSoon));
    assert.equal(methods.length, 3); assert(methods.every(n => n.props.disabled && !n.props.onPress));
    const quantity = h.nodes(tree, 'FormField').find(n => n.props.label === `${f.quantity} *`);
    quantity.props.onChangeText('١,٢٥');
    assert.equal(h.store.getSnapshot().draft.quantity, '١,٢٥');
    h.signedOut();
    assert.equal(h.nodes(h.render(), 'FormField').length, 0);
    h.nodes(h.render(), 'EmptyState')[0].props.onPress(); assert.deepEqual(h.events, ['/login']);
  }
});

test('purchase and expiration hints are attached below their own fields in both languages', () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness({ language }), tree = h.render();
    const f = foodEntryMessages[language], t = backendAddFoodMessages[language];
    const fields = h.nodes(tree, 'FormField');
    assert.equal(fields.find(node => node.props.label === f.purchase).props.hint, t.purchaseHint);
    assert.equal(fields.find(node => node.props.label === f.expiration).props.hint, t.datesHint);
    assert.equal(t.purchaseHint, language === 'ar' ? 'اختياري. YYYY-MM-DD.' : 'Optional. YYYY-MM-DD.');
    assert(!h.nodes(tree, 'AppText').some(node => node.props.children === t.datesHint));
  }
});

test('Save refreshes the kitchen before navigating with Added, and stays disabled until refresh finishes', async () => {
  const h = uiHarness(); fill(h.store);
  let tree = h.render();
  h.nodes(tree, 'Button').find(n => n.props.label === foodEntryMessages.en.save).props.onPress();
  await tick();
  assert.deepEqual(h.events, ['refresh']);
  tree = h.render();
  assert.equal(h.nodes(tree, 'Button').find(n => n.props.label === foodEntryMessages.en.saving).props.disabled, true);
  assert(h.nodes(tree, 'FormField').every(n => n.props.editable === false));
  h.refresh.resolve(); await tick();
  assert.deepEqual(h.events, ['refresh', 'refreshed', 'added', '/kitchen']);
  assert.equal(h.mutations().length, 1);
  assert.equal(h.store.getSnapshot().draft.food, null);
});

test('validation displays translated feedback while keeping the draft', async () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness({ language }); fill(h.store);
    h.store.change('quantity', '0'); await h.store.submit();
    const tree = h.render(), t = backendAddFoodMessages[language];
    assert(h.nodes(tree, 'FormField').some(n => n.props.error === t.quantity));
    assert.equal(h.store.getSnapshot().draft.food.id, food.id);
  }
});

test('UI search/select/clear/no-match keeps all other fields in English and Arabic', async () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness({ language, search: async ({ search }) => ({ foods: { nodes: search === 'missing' ? [] : [food], hasNextPage: false, endCursor: null } }) });
    const t = backendAddFoodMessages[language];
    h.store.change('quantity', '١,٢٥'); h.store.change('expiryDay', '2026-07-01');
    const search = () => h.nodes(h.render(), 'FormField').find(node => node.props.label === `${t.search} *`);
    search().props.onChangeText('tomato'); await h.store.search();
    h.nodes(h.render(), 'ActionRow')[0].props.onPress();
    assert(h.nodes(h.render(), 'AppText').some(n => n.props.children === catalogChoiceName(food, language)));
    search().props.onChangeText('missing'); await h.store.search();
    assert(h.nodes(h.render(), 'AppText').some(n => n.props.children === t.noMatch));
    assert.equal(h.store.getSnapshot().draft.food, null);
    assert.equal(h.store.getSnapshot().draft.quantity, '١,٢٥');
    assert.equal(h.store.getSnapshot().draft.expiryDay, '2026-07-01');
    assert.equal(h.mutations().length, 0);
  }
});

test('UI backend/network failure retains form, shows translated error and does not refresh or navigate', async () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness({ language, add: async () => { throw new Error('Network timeout'); } }); fill(h.store);
    h.nodes(h.render(), 'Button').find(n => n.props.label === foodEntryMessages[language].save).props.onPress();
    await tick();
    assert(h.nodes(h.render(), 'AppText').some(n => n.props.accessibilityRole === 'alert' && n.props.children === backendAddFoodMessages[language].saveError));
    assert.equal(h.store.getSnapshot().draft.food.id, food.id);
    assert.equal(h.store.getSnapshot().draft.quantity, '2');
    assert.deepEqual(h.events, []);
  }
});

test('effect cleanup/restart remains usable under React strict effects; disposal drops late results', async () => {
  const late = deferred(), h = harness({ search: () => late.promise });
  h.store.dispose(); h.store.activate(); fill(h.store);
  assert.equal(await h.store.submit(), true);
  h.store.change('search', 'tomato'); const searching = h.store.search(); h.store.dispose();
  late.resolve({ foods: { nodes: [food], hasNextPage: false, endCursor: null } }); await searching;
  assert.deepEqual(h.store.getSnapshot().results, []);
});
