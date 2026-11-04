const fs = require('node:fs'), test = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { mealRows, scaleMealAmount, guessMealType } = require('../src/domain/cooked-it.ts');
const { CookedMealPreparation, CookedMealStore, logCookedMealOperation } = require('../src/services/cooked-it.ts');
const { resolveActiveHousehold } = require('../src/services/active-household-service.ts');
const { BackendError, createBackendClient } = require('../src/services/backend-core.ts');
const { cookedItMessages: messages } = require('../src/i18n/cooked-it.ts');
const { BackendRecipesStore, emptyRecipes } = require('../src/repositories/backend-recipes-store.ts');
const { BackendKitchenStore } = require('../src/repositories/backend-kitchen-store.ts');
const originalFlag = process.env.EXPO_PUBLIC_BACKEND_INVENTORY;
test.beforeEach(() => { delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY; });
test.after(() => { if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY; else process.env.EXPO_PUBLIC_BACKEND_INVENTORY = originalFlag; });
const ingredient = (id, extra = {}) => ({ id, foodId: id, foodName: id, quantity: '2.000', unit: 'GRAM', optional: false, ...extra });
const recipe = { id: 'recipe', name: 'Recipe name', servings: 2, ingredients: [ingredient('have'), ingredient('short', { quantity: '1.000', unit: 'KILOGRAM' }),
  ingredient('unknown'), ingredient('optional', { optional: true }), ingredient('optional-short', { optional: true }), ingredient('missing'), ingredient('expired'), ingredient('salt'),
  ingredient('optional-missing', { optional: true }), ingredient('optional-expired', { optional: true }), ingredient('optional-staple', { optional: true })], steps: [] };
const suggestion = { recipe, missing: [{ foodId: 'missing' }], expired: [{ foodId: 'expired' }], short: [{ foodId: 'short', missingAmount: '0.250', unit: 'KILOGRAM' }],
  unknown: [{ foodId: 'unknown' }], assumedStaples: [{ foodId: 'salt' }, { foodId: 'optional-staple' }], optional: [
    { foodId: 'optional', status: 'ENOUGH' }, { foodId: 'optional-short', status: 'SHORT', availableAmount: '0.125' },
    { foodId: 'optional-missing', status: 'MISSING' }, { foodId: 'optional-expired', status: 'EXPIRED' }, { foodId: 'optional-staple', status: 'ASSUMED' }],
  expiringSoon: [], haveCount: 1, requiredCount: 4, coverageRatio: 0.25, safetyWarnings: [] };
const batches = [{ id: 'expired', foodId: 'unknown', backendUnit: 'KILOGRAM', quantity: '10.000', expirationDate: '2026-06-01' },
  { id: 'valid', foodId: 'unknown', backendUnit: 'PIECE', quantity: '3.000', expirationDate: '2026-06-03' },
  { id: 'undated', foodId: 'unknown', backendUnit: 'GRAM', quantity: '100.000', expirationDate: null }];
const rows = () => mealRows(recipe, suggestion, batches, '2026-06-02');
const success = { logMeal: { __typename: 'MealLogSuccessType', replayed: false, meals: [{ id: 'meal', userId: 'user' }] } };
async function fixture({ mutate = async () => success, refresh = async () => {}, customRows, useDefaultKey = false } = {}) {
  let revision = 1, keys = 0, clock = 0, refreshes = 0, completions = 0;
  const calls = [], saved = new Map();
  const storage = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value), removeItem: async key => saved.delete(key) };
  const auth = { getIdentityRevision: () => revision, getIdentityContext: async () => ({ userId: 'user', revision, backendUrl: 'http://backend.invalid' }),
    authenticatedGraphql: async (query, variables, household) => {
      if (query.includes('query MyHouseholds')) return { myHouseholds: ['home', 'other'].map(id => ({ household: { id, name: id, timezone: 'Africa/Cairo' } })) };
      assert.equal(query, logCookedMealOperation); calls.push({ input: structuredClone(variables.input), household }); return mutate(variables.input, calls.length);
    } };
  await resolveActiveHousehold(auth, storage);
  const create = () => new CookedMealStore(auth, storage, recipe, customRows ?? rows(), 'LUNCH', async () => { refreshes++; await refresh(); }, () => { completions++; },
    useDefaultKey ? undefined : () => `meal-${++keys}`, () => new Date(Date.UTC(2026, 5, 2, 12, 0, clock++)));
  return { store: create(), create, calls, auth, storage, counts: () => ({ refreshes, completions }),
    switchUser: () => { revision++; }, switchHousehold: async () => { for (const key of saved.keys()) saved.set(key, 'other'); await resolveActiveHousehold(auth, storage); } };
}
const uncheckUnknown = store => store.change('checked', false, 'unknown');

test('exact serving scaling rounds once, handles Arabic input and rejects precision/range errors', () => {
  assert.equal(scaleMealAmount('0.100', '3', '2'), '0.067'); assert.equal(scaleMealAmount('1.250', '2', '٣'), '1.875');
  assert.equal(scaleMealAmount('1.000', '4', '٠,٥'), '0.125'); assert.equal(scaleMealAmount('0.001', '3', '1'), '0.000');
  for (const value of ['0', '-1', 'NaN', '1.0001']) assert.throws(() => scaleMealAmount('1.000', '2', value));
  assert.throws(() => scaleMealAmount('999999999.999', '1', '2'));
});
test('prefills HAVE/SHORT, keeps UNKNOWN empty in eligible kitchen unit, excludes missing/expired/staples and leaves optional unchecked', () => {
  const result = rows(); assert.deepEqual(result.map(r => r.id), ['have', 'short', 'unknown', 'optional', 'optional-short']);
  assert.equal(result[0].amount, '2.000'); assert.equal(result[1].amount, '0.750');
  assert.equal(result[2].amount, ''); assert.equal(result[2].unit, 'PIECE'); assert.equal(result[2].checked, true);
  assert(result.filter(r => r.optional).every(r => !r.checked)); assert.equal(result[4].amount, '0.125');
});
test('servings changes cap SHORT at available stock and recover after an invalid interim entry', async () => {
  const h = await fixture(); h.store.change('servings', '4'); let result = h.store.getSnapshot();
  assert.equal(result.rows[0].amount, '4.000'); assert.equal(result.rows[1].amount, '0.750');
  h.store.change('servings', ''); h.store.change('servings', '0.5'); result = h.store.getSnapshot();
  assert.equal(result.rows[0].amount, '0.500'); assert.equal(result.rows[1].amount, '0.250');
});
test('meal type uses device local time including the 11:00 and 16:00 boundaries', () => {
  for (const [hour, minute, expected] of [[10, 59, 'BREAKFAST'], [11, 0, 'LUNCH'], [16, 0, 'LUNCH'], [16, 1, 'DINNER'], [23, 0, 'DINNER']])
    assert.equal(guessMealType(new Date(2026, 5, 2, hour, minute)), expected);
});
test('checked UNKNOWN requires positive amount, accepts Arabic digits/comma in fixed kitchen unit; unchecking is allowed', async () => {
  const h = await fixture(); assert.equal(await h.store.submit(), false); assert(h.store.getSnapshot().validation.includes('unknown')); assert.equal(h.calls.length, 0);
  h.store.change('amount', '١,٢٥', 'unknown'); assert.equal(await h.store.submit(), true);
  const input = h.calls[0].input; assert.deepEqual(input.items.find(i => i.foodId === 'unknown'), { foodId: 'unknown', amount: '1.250', unit: 'PIECE' });
  assert.equal(input.origin, 'HOME'); assert.equal(input.skipExpiredBatches, true); assert.equal(input.name, recipe.name); assert.equal(input.mealType, 'LUNCH');
  assert(!input.items.some(i => i.foodId === 'optional')); assert.equal(h.calls[0].household, 'home');
});
test('timeout after commit retries identical key/payload/eatenAt and deducts once; success cannot double-submit', async () => {
  const committed = new Set(); let deductions = 0;
  const h = await fixture({ mutate: async (input, attempt) => { if (!committed.has(input.idempotencyKey)) { committed.add(input.idempotencyKey); deductions++; }
    if (attempt === 1) throw new Error('Timeout'); return success; } }); uncheckUnknown(h.store);
  assert.equal(await h.store.submit(), false); assert.equal(await h.store.submit(), true); assert.deepEqual(h.calls[0], h.calls[1]); assert.equal(deductions, 1);
  assert.equal(await h.store.submit(), false); assert.equal(h.calls.length, 2); assert.deepEqual(h.counts(), { refreshes: 1, completions: 1 });
  const next = h.create(); uncheckUnknown(next); await next.submit(); assert.notEqual(h.calls.at(-1).input.idempotencyKey, h.calls[0].input.idempotencyKey);
});
test('any edit after failure starts a new operation; double submission in flight is disabled', async () => {
  let release; const response = new Promise(resolve => { release = resolve; });
  const h = await fixture({ mutate: async (_input, attempt) => { if (attempt === 1) throw new Error('offline'); return response; } }); uncheckUnknown(h.store);
  await h.store.submit(); h.store.change('amount', '1.000', 'have'); const pending = h.store.submit();
  assert.equal(await h.store.submit(), false); release(success); await pending;
  assert.notEqual(h.calls[0].input.idempotencyKey, h.calls[1].input.idempotencyKey); assert.notEqual(h.calls[0].input.eatenAt, h.calls[1].input.eatenAt);
});
test('insufficient stock identifies the row without losing entries; adjusting it starts a new key', async () => {
  const h = await fixture({ mutate: async (_input, attempt) => attempt === 1 ? { logMeal: { __typename: 'InsufficientStockType', foodId: 'short', available: '0.500', unit: 'KILOGRAM' } } : success });
  uncheckUnknown(h.store); await h.store.submit(); assert.equal(h.store.getSnapshot().insufficient.foodId, 'short'); assert.equal(h.store.getSnapshot().rows[1].amount, '0.750');
  h.store.change('amount', '0.5', 'short'); await h.store.submit(); assert.notEqual(h.calls[0].input.idempotencyKey, h.calls[1].input.idempotencyKey);
});
test('confirmed mutation with failed refresh retries refresh only, locks draft and reports success once', async () => {
  let attempt = 0; const h = await fixture({ refresh: async () => { if (++attempt === 1) throw new Error('offline refresh'); } }); uncheckUnknown(h.store);
  assert.equal(await h.store.submit(), false); assert.equal(h.store.getSnapshot().refreshPending, true);
  h.store.change('amount', '99', 'have'); assert.equal(h.store.getSnapshot().rows[0].amount, '2.000');
  assert.equal(await h.store.submit(), true); assert.equal(h.calls.length, 1); assert.deepEqual(h.counts(), { refreshes: 2, completions: 1 });
});
test('identity/household changes discard stale success and prevent refresh/navigation', async () => {
  for (const mode of ['switchUser', 'switchHousehold']) {
    let release; const response = new Promise(resolve => { release = resolve; });
    const h = await fixture({ mutate: () => response }); uncheckUnknown(h.store); const pending = h.store.submit();
    await new Promise(resolve => setImmediate(resolve)); await h[mode](); release(success); assert.equal(await pending, false);
    assert.deepEqual(h.counts(), { refreshes: 0, completions: 0 });
  }
});
test('flag false never sends logMeal', async () => { const h = await fixture(); process.env.EXPO_PUBLIC_BACKEND_INVENTORY = 'false'; assert.equal(await h.store.submit(), false); assert.equal(h.calls.length, 0); });
test('GraphQL contract validates against merged schema, and conversion errors retain an identified food', async () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8')); assert.deepEqual(validate(schema, parse(logCookedMealOperation)), []);
  await assert.rejects(createBackendClient('http://backend.invalid', async () => Response.json({ errors: [{ message: 'Cannot convert', extensions: { code: 'UNIT_NOT_CONVERTIBLE', foodId: 'unknown' } }] })).graphql('{}'), error => error.foodId === 'unknown');
});

function loadTsx(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(id => id in mocks ? mocks[id] : require(id), exports); return exports;
}
function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children), action: expand(tree.props?.action) } };
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(n => nodes(n, type));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type), ...nodes(tree.props?.action, type)];
}
function formUi(store, language = 'en') {
  const effects = [], routes = [], slots = [], element = (type, props, key) => ({ type, props, key });
  let cursor = 0;
  const mocks = {
    react: { useEffect: effect => effects.push(effect), useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; }, useSyncExternalStore: (_s, get) => get() },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'expo-router': { router: { push: route => routes.push(route), replace: route => routes.push(route) }, useLocalSearchParams: () => ({ id: 'recipe' }) },
    'react-native': { Pressable: 'Pressable', View: 'View' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-native-async-storage/async-storage': {},
    '@/components/ui/core': { ...Object.fromEntries(['AppText', 'Button', 'Card', 'Chip', 'EmptyState', 'PageHeader', 'Screen'].map(k => [k, k])), uiStyles: {} },
    '@/components/ui/form-field': { FormField: 'FormField' }, '@/components/ui/icon': { Icon: 'Icon' },
    '@/providers/backend-recipes-provider': { useBackendRecipes: () => assert.fail('Backend hook must not run with flag false') },
    '@/providers/backend-kitchen-provider': {}, '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) }, '@/theme/tokens': { spacing: {} }, '@/services/auth': {},
    '@/services/inventory-feature': require('../src/services/inventory-feature.ts'), '@/services/auth-validation': require('../src/services/auth-validation.ts'),
    '@/services/cooked-it': { CookedMealStore }, '@/domain/cooked-it': require('../src/domain/cooked-it.ts'),
    '@/domain/inventory-enum-adapters': require('../src/domain/inventory-enum-adapters.ts'), '@/i18n/home': require('../src/i18n/home.ts'),
    '@/i18n/backend-kitchen': require('../src/i18n/backend-kitchen.ts'), '@/i18n/backend-recipes': require('../src/i18n/backend-recipes.ts'),
    '@/i18n/cooked-it': { cookedItMessages: messages }, '@/utils/backend-recipe-view': require('../src/utils/backend-recipe-view.ts'),
    '@/utils/backend-kitchen-view': require('../src/utils/backend-kitchen-view.ts'), '@/services/backend-stock-actions': require('../src/services/backend-stock-actions.ts'),
  };
  const screen = loadTsx('src/screens/cooked-it-screen.tsx', mocks);
  return { screen, mocks, routes, effects, render: () => { cursor = 0; return expand(screen.MealForm({ store })); } };
}

test('confirmation UI uses readonly kitchen units, editable amounts and checkboxes; UNKNOWN blocks confirmation until filled/unselected in EN/AR', async () => {
  for (const language of ['en', 'ar']) {
    const h = await fixture(), ui = formUi(h.store, language); let tree = ui.render();
    assert.equal(nodes(tree, 'Pressable').filter(n => n.props.accessibilityRole === 'checkbox').length, 5);
    assert.equal(nodes(tree, 'Chip').length, 5, 'meal type options only, no editable unit picker');
    let confirm = nodes(tree, 'Button').find(n => n.props.label === messages[language].confirm); assert.equal(confirm.props.disabled, true);
    const unknown = nodes(tree, 'Card').find(n => n.key === 'unknown');
    assert(nodes(unknown, 'FormField')[0].props.label.includes(language === 'en' ? 'pieces' : 'قطع'));
    nodes(unknown, 'Pressable')[0].props.onPress(); tree = ui.render();
    confirm = nodes(tree, 'Button').find(n => n.props.label === messages[language].confirm); assert.equal(confirm.props.disabled, false);
    nodes(tree, 'Chip').find(n => n.props.label === messages[language].SNACK).props.onPress(); assert.equal(h.store.getSnapshot().mealType, 'SNACK');
    assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ar).sort());
  }
});
test('insufficient stock marks just the identified row; conversion error is on that row or at top when unidentified', async () => {
  for (const language of ['en', 'ar']) {
    const h = await fixture({ mutate: async () => ({ logMeal: { __typename: 'InsufficientStockType', foodId: 'short', available: '0.500', unit: 'KILOGRAM' } }) });
    uncheckUnknown(h.store); await h.store.submit(); const ui = formUi(h.store, language); const tree = ui.render();
    const short = nodes(tree, 'Card').find(n => n.key === 'short'); assert(nodes(short, 'AppText').some(n => n.props.accessibilityRole === 'alert'));
    assert(!nodes(nodes(tree, 'Card').find(n => n.key === 'have'), 'AppText').some(n => n.props.accessibilityRole === 'alert'));
    for (const identified of [true, false]) {
      const conversion = await fixture({ mutate: async () => { throw new BackendError('conversion', undefined, ['UNIT_NOT_CONVERTIBLE'], identified ? 'have' : undefined); } });
      uncheckUnknown(conversion.store); await conversion.store.submit(); const body = formUi(conversion.store, language).render();
      assert.equal(nodes(body, 'AppText').filter(n => n.props.children === messages[language].conversion).length, 1);
      assert.equal(nodes(nodes(body, 'Card').find(n => n.key === 'have'), 'AppText').filter(n => n.props.children === messages[language].conversion).length, identified ? 1 : 0);
    }
  }
});
test('flag false confirmation route redirects without reading backend state or creating a form', () => {
  process.env.EXPO_PUBLIC_BACKEND_INVENTORY = 'false'; const ui = formUi(null); expand(ui.screen.default()); ui.effects.forEach(effect => effect());
  assert.deepEqual(ui.routes.at(-1), { pathname: '/recipes/[id]', params: { id: 'recipe' } });
});
test('meal refresh updates Kitchen/list/detail and shows a scoped notice that survives refresh and clears on sign-out', async () => {
  let listReads = 0, detailReads = 0;
  const page = { nodes: [suggestion], hasNextPage: false, endCursor: null, totalCount: 1, today: '2026-06-02', restarted: false };
  const store = new BackendRecipesStore(() => ({ list: async () => { listReads++; return page; }, get: async () => { detailReads++; return recipe; }, findSuggestion: async () => suggestion }));
  store.setOwner('user'); await store.ensureLoaded(); await store.ensureDetail('recipe');
  await store.refreshAfterMeal('recipe', 'after-meal'); assert.equal(listReads, 2); assert.equal(detailReads, 2);
  store.showMealRemoved('recipe'); const notice = store.getSnapshot().removedNotice;
  await store.refresh(); assert.deepEqual(store.getSnapshot().removedNotice, notice);
  store.dismissMealRemoved(notice.id); assert.equal(store.getSnapshot().removedNotice, null);
  store.showMealRemoved('recipe'); store.setOwner(null); assert.equal(store.getSnapshot().removedNotice, null);
  let fail = false;
  const kitchen = new BackendKitchenStore(() => ({ list: async () => { if (fail) throw new Error('offline'); return { items: [], today: '2026-06-02' }; } }));
  kitchen.setUser('user'); await kitchen.refreshAfterMeal(); assert.equal(kitchen.getSnapshot().status, 'ready');
  fail = true; await assert.rejects(kitchen.refreshAfterMeal());
  assert.equal(emptyRecipes.removedNotice, null);
});

test('confirmation preparation retains the same draft during provider refreshes and allows retry after setup failure', async () => {
  const h = await fixture(), preparation = new CookedMealPreparation();
  preparation.prepare(() => h.store); preparation.prepare(() => assert.fail('A provider refresh must not replace the draft'));
  assert.equal(preparation.getSnapshot().store, h.store);
  const failed = new CookedMealPreparation(); failed.prepare(() => { throw new Error('Stale inventory'); });
  assert(failed.getSnapshot().error); failed.retry(); failed.prepare(() => h.store); assert.equal(failed.getSnapshot().store, h.store);
});

test('native runtimes without crypto.randomUUID still get a usable per-operation key', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    const h = await fixture({ useDefaultKey: true }); uncheckUnknown(h.store); assert.equal(await h.store.submit(), true);
    assert.match(h.calls[0].input.idempotencyKey, /^mobile-meal-/);
    const next = h.create(); uncheckUnknown(next); await next.submit(); assert.notEqual(h.calls[0].input.idempotencyKey, h.calls[1].input.idempotencyKey);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; }
});

test('confirmation amounts omit trailing zeros without changing exact stored values; the unit appears only beside Amount in EN/AR', async () => {
  for (const language of ['en', 'ar']) {
    const values = ['0.500', '1.000', '1.250'];
    const h = await fixture({ customRows: rows().slice(0, 3).map((row, index) => ({ ...row, amount: values[index] })) });
    const ui = formUi(h.store, language), tree = ui.render();
    assert.deepEqual(nodes(tree, 'Card').map(card => nodes(card, 'FormField')[0].props.value), ['0.5', '1', '1.25']);
    assert.deepEqual(h.store.getSnapshot().rows.map(row => row.amount), values);
    for (const card of nodes(tree, 'Card')) {
      const field = nodes(card, 'FormField')[0], unit = field.props.label.split(' · ')[1];
      assert(unit); assert.equal(nodes(card, 'AppText').filter(n => n.props.children === unit).length, 0);
    }
  }
});
test('editing keeps partial decimals and formats on blur without rewriting the stored draft', async () => {
  const h = await fixture(), ui = formUi(h.store);
  let field = nodes(nodes(ui.render(), 'Card')[0], 'FormField')[0];
  field.props.onFocus(); field.props.onChangeText('1.');
  field = nodes(nodes(ui.render(), 'Card')[0], 'FormField')[0]; assert.equal(field.props.value, '1.');
  field.props.onChangeText('1.20'); field = nodes(nodes(ui.render(), 'Card')[0], 'FormField')[0]; assert.equal(field.props.value, '1.20');
  field.props.onBlur(); assert.equal(nodes(nodes(ui.render(), 'Card')[0], 'FormField')[0].props.value, '1.2');
  assert.equal(h.store.getSnapshot().rows[0].amount, '1.20');
});
