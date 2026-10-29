const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { BackendKitchenStore, visibleBackendKitchen, emptyBackendKitchen } = require('../src/repositories/backend-kitchen-store.ts');
const { backendKitchenView, displayInventoryQuantity } = require('../src/utils/backend-kitchen-view.ts');
const backendView = require('../src/utils/backend-kitchen-view.ts');
const { loadInventoryArabicNames, inventoryFoodNamesOperation } = require('../src/services/inventory-catalog-names.ts');
const { backendKitchenMessages } = require('../src/i18n/backend-kitchen.ts');
const { homeUnitLabels, homeMessages } = require('../src/i18n/home.ts');
const { inventoryMessages } = require('../src/i18n/inventory.ts');
const item = { id: 'backend-batch', foodId: 'tomato', name: 'Backend tomato', quantity: '1.250', unitId: 'kg', storageId: 'refrigerator', backendUnit: 'KILOGRAM', backendStorageLocation: 'FRIDGE', readOnly: false, expirationDate: '2026-06-02', version: 1 };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('backend store handles signed out, loading, ready, empty, error and retry without a local repository', async () => {
  let response = deferred(), calls = 0;
  const store = new BackendKitchenStore(() => ({ list: () => { calls++; return response.promise; } }));
  assert.equal(store.getSnapshot().status, 'signed-out');
  await store.reload();
  assert.equal(calls, 0);
  store.setUser('a');
  assert.equal(store.getSnapshot().status, 'loading');
  response.resolve({ items: [item], today: '2026-06-01' });
  await tick();
  assert.deepEqual(store.getSnapshot().items, [item]);
  response = deferred();
  const failed = store.reload();
  assert.deepEqual(store.getSnapshot().items, []);
  response.reject(new Error('Offline'));
  await failed;
  assert.equal(store.getSnapshot().status, 'error');
  response = deferred();
  const retry = store.reload();
  response.resolve({ items: [], today: '2026-06-01' });
  await retry;
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().items, []);
  assert.equal(calls, 3);
});

test('account switch and sign-out immediately clear rows and discard late results', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const store = new BackendKitchenStore(() => ({ list: () => calls++ === 0 ? first.promise : second.promise }));
  store.setUser('a');
  store.setUser('b');
  assert.deepEqual(store.getSnapshot().items, []);
  first.resolve({ items: [item], today: '2026-06-01' });
  await tick();
  assert.deepEqual(store.getSnapshot().items, []);
  second.resolve({ items: [{ ...item, name: 'User B food' }], today: '2026-06-01' });
  await tick();
  assert.equal(store.getSnapshot().items[0].name, 'User B food');
  const populated = store.getSnapshot();
  assert.deepEqual(visibleBackendKitchen(populated, 'b', true).items, []);
  assert.deepEqual(visibleBackendKitchen(populated, 'c', false).items, []);
  assert.deepEqual(visibleBackendKitchen(populated, null, false).items, []);
  store.setUser(null);
  assert.equal(store.getSnapshot().status, 'signed-out');
  assert.deepEqual(store.getSnapshot().items, []);
});

test('details load via get and cannot reappear after account switch', async () => {
  const detail = deferred();
  const store = new BackendKitchenStore(() => ({ list: async () => ({ items: [], today: '2026-06-01' }), get: () => detail.promise }));
  store.setUser('a');
  const request = store.loadDetail(item.id);
  assert.equal(store.getSnapshot().detail.status, 'loading');
  store.setUser(null);
  detail.resolve({ ...item, transactions: { nodes: [], hasNextPage: false, endCursor: null } });
  await request;
  assert.equal(store.getSnapshot().detail, null);
});

test('exact quantity display never passes through Number', () => {
  for (const [input, output] of [['2.000', '2'], ['1.250', '1.25'], ['0.001', '0.001'], ['999999999.999', '999999999.999'], ['10', '10']]) assert.equal(displayInventoryQuantity(input), output);
});

test('backend search/storage/expiry sort/Use First preserve unsupported batches and do not mutate source', () => {
  const items = [item, { ...item, id: 'other', name: 'Oil', storageId: null, backendStorageLocation: 'COUNTER', expirationDate: null }];
  const original = JSON.stringify(items);
  assert.equal(backendKitchenView(items, ' TOMATO ', 'refrigerator', 'name', false, '2026-06-01', 'en')[0], item);
  assert.equal(backendKitchenView(items, '', 'COUNTER', 'name', false, '2026-06-01', 'en')[0].id, 'other');
  assert.deepEqual(backendKitchenView(items, '', 'all', 'expiry', true, '2026-06-01', 'en').map(i => i.id), [item.id]);
  assert.equal(JSON.stringify(items), original);
});

test('display names use Arabic aliases or canonical fallback, capitalize English, and never mutate inventory', () => {
  const raw = { ...item, name: 'olive oil', arabicName: 'زيت زيتون' }, before = JSON.stringify(raw);
  assert.equal(backendView.backendFoodName(raw, 'ar'), 'زيت زيتون');
  assert.equal(backendView.backendFoodName(raw, 'en'), 'Olive oil');
  assert.equal(backendView.backendFoodName({ ...raw, arabicName: undefined }, 'ar'), 'olive oil');
  assert.equal(backendView.backendFoodName({ ...raw, arabicName: '  ' }, 'ar'), 'olive oil');
  assert.equal(backendKitchenView([raw], 'زيت', 'all', 'name', false, '2026-06-01', 'ar')[0], raw);
  assert.equal(JSON.stringify(raw), before);
});

test('unsupported labels are translated in rows, details and storage filters without enabling writes', () => {
  for (const [unit, en, ar] of [['TABLESPOON', 'tbsp', 'م.ك'], ['TEASPOON', 'tsp', 'م.ص']]) {
    const raw = { ...item, unitId: null, backendUnit: unit, readOnly: true };
    assert.equal(backendView.backendUnitLabel(raw, 'en'), en);
    assert.equal(backendView.backendUnitLabel(raw, 'ar'), ar);
    assert.equal(raw.readOnly, true);
  }
  for (const [storage, en, ar] of [['COUNTER', 'Counter', 'على الرخامة'], ['OTHER', 'Other', 'أخرى']]) {
    const raw = { ...item, storageId: null, backendStorageLocation: storage };
    assert.equal(backendView.backendStorageLabel(raw, 'en'), en);
    assert.equal(backendView.backendStorageLabel(raw, 'ar'), ar);
  }
});

test('catalog alias reads deduplicate and batch food IDs, prefer primary Arabic, and do no inventory writes', async () => {
  let calls = 0;
  const auth = { authenticatedGraphql: async (query, variables) => {
    calls++;
    assert(query.startsWith('query InventoryFoodNames'));
    assert(Object.keys(variables).length <= 20);
    return Object.fromEntries(Object.entries(variables).map(([key, id]) => [key.replace('id', 'f'), {
      id, aliases: [{ languageCode: 'en', alias: 'carrot', isPrimary: true }, { languageCode: 'ar', alias: 'بديل', isPrimary: false }, { languageCode: 'ar', alias: `عربي ${id}`, isPrimary: true }],
    }]));
  } };
  assert.equal((await loadInventoryArabicNames(auth, [])).size, 0);
  assert.equal(calls, 0);
  const ids = Array.from({ length: 21 }, (_, i) => `food-${i}`);
  const result = await loadInventoryArabicNames(auth, [...ids, ids[0]]);
  assert.equal(calls, 2); assert.equal(result.size, 21);
  assert.equal(result.get(ids[0]), 'عربي food-0');
});

test('missing Arabic/catalog entries allow canonical fallback; catalog failures surface', async () => {
  const names = await loadInventoryArabicNames({ authenticatedGraphql: async () => ({
    f0: { id: 'a', aliases: [{ languageCode: 'en', alias: 'carrot', isPrimary: true }] }, f1: null,
  }) }, ['a', 'b']);
  assert.equal(names.size, 0);
  await assert.rejects(loadInventoryArabicNames({ authenticatedGraphql: async () => { throw new Error('Offline'); } }, ['a']), /Offline/);
});

test('catalog alias operation validates against the backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  assert.deepEqual(validate(schema, parse(inventoryFoodNamesOperation(20))), []);
});

function uiHarness() {
  let state = { ...emptyBackendKitchen, owner: 'a', status: 'ready', items: [item], today: '2026-06-02' };
  let language = 'en', retryCount = 0;
  const navigated = [], details = [], slots = [], effects = [];
  let cursor = 0;
  const local = { items: [{ id: 'local-one', name: 'Private local food' }, { id: 'local-two' }], status: 'ready', retryRead: () => {} };
  const code = ts.transpileModule(fs.readFileSync('src/screens/backend-kitchen-screen.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported = {};
  new Function('require', 'exports', code)(id => {
    if (id === 'react') return {
      useEffect: effect => effects.push(effect),
      useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; },
    };
    if (id === 'expo-router') return { router: { push: route => navigated.push(route), navigate: route => navigated.push(route), replace: route => navigated.push(route), canGoBack: () => false }, useLocalSearchParams: () => ({ id: item.id }) };
    if (id === 'react-native') return { ActivityIndicator: 'ActivityIndicator', View: 'View' };
    if (id === '@/components/ui/core') return { ...Object.fromEntries(['AppText', 'ActionRow', 'Button', 'Card', 'Chip', 'EmptyState', 'PageHeader', 'Screen', 'SearchField', 'SectionHeader'].map(name => [name, name])), uiStyles: {} };
    if (id === '@/providers/backend-kitchen-provider') return { useBackendKitchen: () => ({ ...state, retry: () => { retryCount++; }, loadDetail: id => details.push(id) }) };
    if (id === '@/providers/inventory-provider') return { useInventory: () => local };
    if (id === '@/providers/language-provider') return { useLanguage: () => ({ language }) };
    if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: { textSubtle: '#666' } }) };
    if (id === '@/i18n/backend-kitchen') return { backendKitchenMessages };
    if (id === '@/i18n/home') return { homeUnitLabels, homeMessages };
    if (id === '@/i18n/inventory') return { inventoryMessages };
    if (id === '@/data/home-content') return { recipeTitle: () => '', searchHome: () => ({ recipes: [] }) };
    if (id === '@/utils/backend-kitchen-view') return backendView;
    if (id === './home-screen') return { __esModule: true, default: 'OriginalHome' };
    if (id === '@/theme/tokens') return { spacing: {} };
    return require(id);
  }, exported);
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children), action: expand(node.props?.action), trailing: expand(node.props?.trailing) } };
  }
  function nodes(node, type) {
    if (Array.isArray(node)) return node.flatMap(value => nodes(value, type));
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...nodes(node.props.children, type), ...nodes(node.props.action, type)];
  }
  return {
    exported, local, navigated, details, effects, nodes,
    render: (which = 'BackendKitchenScreen', props = {}) => { cursor = 0; return expand(exported[which](props)); },
    set: update => { state = { ...state, ...update }; }, language: value => { language = value; }, retries: () => retryCount,
  };
}

test('Kitchen shows backend items, sensible quantities and an untouched device-only count', () => {
    const h = uiHarness(), before = JSON.stringify(h.local), tree = h.render();
    assert(h.nodes(tree, 'ActionRow').some(row => row.props.title === 'Backend tomato' && row.props.subtitle.includes('1.25 kg')));
    assert(h.nodes(tree, 'SectionHeader').some(node => node.props.title === 'On this device · 2'));
    assert.equal(JSON.stringify(h.local), before);
    assert.equal(JSON.stringify(tree).includes('Private local food'), false);
    const add = h.nodes(tree, 'Button').find(node => node.props.label === 'Add food');
    assert.equal(add.props.disabled, true);
    assert.equal(add.props.onPress, undefined);
});

test('backend Home reuses the original screen, supplies display-only names, and keeps read-only notices', () => {
  const h = uiHarness();
  const raw = { ...item, name: 'carrot', arabicName: 'جزر' };
  h.set({ items: [raw] });
  h.language('ar');
  const tree = h.render('BackendHomeScreen');
  assert.equal(tree.type, 'OriginalHome');
  assert.equal(tree.props.backend.foodName(tree.props.backend.items[0]), 'جزر');
  assert.equal(tree.props.backend.items[0].name, 'carrot');
  assert.equal(raw.name, 'carrot');
  assert.equal(tree.props.backend.saved, backendKitchenMessages.ar.saved);
  assert(tree.props.backend.notice);
  assert(tree.props.backend.deviceNotice);
});

function homeLayoutHarness(backend, source = fs.readFileSync('src/screens/home-screen.tsx', 'utf8')) {
  const slots = [], routes = [];
  let cursor = 0;
  const content = require('../src/data/home-content.ts');
  const inventory = require('../src/domain/inventory.ts');
  const exported = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(id => {
    if (id === 'react') return {
      createContext: () => ({ Provider: 'HomeDirection' }), useContext: () => false,
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    };
    if (id === 'expo-router') return { router: { navigate: path => routes.push(path), push: path => routes.push(path) } };
    if (id === 'react-native') return Object.fromEntries(['Modal', 'Pressable', 'ScrollView', 'View'].map(name => [name, name]));
    if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (id === '@/components/ui/core') return Object.fromEntries(['AppText', 'Button', 'Card', 'Chip', 'Screen', 'SearchField'].map(name => [name, name]));
    if (id === '@/components/ui/icon') return { Icon: 'Icon' };
    if (id === '@/components/food-image') return { FoodImage: 'FoodImage' };
    if (id === '@/providers/inventory-provider') return { useInventory: () => ({ items: [{ ...item, name: 'Local food', quantity: 2, unitId: 'kg' }], status: 'ready', error: null, retryRead: () => {} }), useToday: () => '2026-06-02' };
    if (id === '@/providers/language-provider') return { useLanguage: () => ({ language: 'en' }) };
    if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: {} }) };
    if (id === '@/theme/tokens') return { radii: {}, spacing: {} };
    if (id === '@/data/home-content') return content;
    if (id === '@/domain/inventory') return inventory;
    if (id === '@/i18n/home') return { homeMessages, homeUnitLabels };
    if (id.startsWith('@/')) return require('../src/' + id.slice(2) + '.ts');
    return require(id);
  }, exported);
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  function nodes(node, type) {
    if (Array.isArray(node)) return node.flatMap(value => nodes(value, type));
    if (!node || typeof node !== 'object' || node.type === 'Modal' && !node.props.visible) return [];
    return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
  }
  return { render: () => { cursor = 0; return expand(exported.default({ backend })); }, nodes, routes };
}

test('backend Home keeps the original hero, storage counts, Use First tiles and recipe preview layout', () => {
  const backend = {
    items: [item, { ...item, id: 'frozen', storageId: 'freezer' }, { ...item, id: 'dry', storageId: 'pantry' }],
    status: 'ready', today: '2026-06-02', retry: async () => {},
    notice: 'backend-status', deviceNotice: 'device-notice', saved: 'foods in your household',
    empty: 'Your kitchen is empty', emptyBody: '', writesSoon: 'Writes coming soon', readOnly: 'Read-only',
    quantityLabel: value => backendView.backendQuantityLabel(value, 'en'),
    foodName: value => backendView.backendFoodName(value, 'en'),
  };
  const h = homeLayoutHarness(backend), tree = h.render();
  const content = require('../src/data/home-content.ts');
  assert(h.nodes(tree, 'FoodImage').some(node => node.props.uri === content.kitchenPhoto && node.props.height === 110));
  for (const label of [homeMessages.en.overview, homeMessages.en.refrigerator, homeMessages.en.freezer, homeMessages.en.pantry, homeMessages.en.useFirst, homeMessages.en.ideas]) {
    assert(h.nodes(tree, 'AppText').some(node => node.props.children === label), label);
  }
  assert(h.nodes(tree, 'AppText').filter(node => node.props.variant === 'heading' && node.props.children === '1').length >= 3);
  assert.equal(h.nodes(tree, 'FoodImage').filter(node => Object.values(content.recipePhotos).includes(node.props.uri)).length, 2);
  const preview = h.nodes(tree, 'Pressable').find(node => node.props.accessibilityLabel?.includes(homeMessages.en.preview));
  preview.props.onPress();
  assert.equal(h.nodes(h.render(), 'Modal').length, 1);
  const add = h.nodes(tree, 'Button').find(node => node.props.label === homeMessages.en.add);
  assert.equal(add.props.disabled, true); assert.equal(add.props.onPress, undefined);
  h.nodes(tree, 'Button').find(node => node.props.label === homeMessages.en.openKitchen).props.onPress();
  assert.deepEqual(h.routes, ['/kitchen']);
});

test('signed-out/loading/empty/error/retry states are clear in English and Arabic', () => {
  for (const language of ['en', 'ar']) {
    const h = uiHarness(), t = backendKitchenMessages[language]; h.language(language);
    h.set({ status: 'signed-out', items: [] });
    const signedOut = h.nodes(h.render(), 'EmptyState').find(node => node.props.title === t.signInTitle);
    signedOut.props.onPress(); assert.deepEqual(h.navigated, ['/login']);
    h.set({ status: 'loading' }); assert.equal(h.nodes(h.render(), 'ActivityIndicator').length, 1);
    h.set({ status: 'ready', items: [] }); assert(h.nodes(h.render(), 'EmptyState').some(node => node.props.title === t.empty));
    h.set({ status: 'error' });
    h.nodes(h.render(), 'Button').find(node => node.props.label === t.retry).props.onPress(); assert.equal(h.retries(), 1);
  }
  assert.deepEqual(Object.keys(backendKitchenMessages.en), Object.keys(backendKitchenMessages.ar));
});

test('unsupported labels remain visible; food details load from get and disable edit/delete', () => {
  const h = uiHarness();
  h.set({ items: [{ ...item, readOnly: true, unitId: null, storageId: null, backendUnit: 'TABLESPOON', backendStorageLocation: 'COUNTER' }] });
  const row = h.nodes(h.render(), 'ActionRow')[0];
  assert.equal(row.props.subtitle, '1.25 tbsp · Counter');
  assert(h.nodes(h.render(), 'Chip').some(node => node.props.label === 'Counter'));
  assert.equal(row.props.trailing.props.children, '›');
  h.language('ar');
  const arabic = h.nodes(h.render(), 'ActionRow')[0];
  assert.equal(arabic.props.subtitle, undefined);
  assert.equal(arabic.props.trailing.type, 'View');
  assert.equal(arabic.props.trailing.props.style.direction, 'ltr');
  assert.equal(arabic.props.trailing.props.style.borderLeftWidth, 2);
  assert.equal(arabic.props.trailing.props.style.borderBottomWidth, 2);
  assert.deepEqual(arabic.props.trailing.props.style.transform, [{ rotate: '45deg' }]);
  assert.deepEqual(h.nodes(arabic, 'AppText').slice(0, 4).map(node => node.props.children), ['1.25', 'م.ك', '·', 'على الرخامة']);
  assert(h.nodes(h.render(), 'Chip').some(node => node.props.label === 'على الرخامة'));
  h.language('en');
  h.render('BackendFoodDetailScreen'); h.effects[0](); assert.deepEqual(h.details, [item.id]);
  h.set({ detail: { id: item.id, status: 'ready', item } });
  const buttons = h.nodes(h.render('BackendFoodDetailScreen'), 'Button');
  for (const label of ['Edit', 'Delete']) {
    const button = buttons.find(node => node.props.label === label);
    assert.equal(button.props.disabled, true); assert.equal(button.props.onPress, undefined);
  }
});

test('Arabic Kitchen and detail isolate quantity and unit as ordered layout segments; English stays unchanged', () => {
  for (const [overrides, quantity, unit, storage, english] of [
    [{ quantity: '2.000', unitId: 'pieces', backendUnit: 'PIECE' }, '2', 'قطع', 'الثلاجة', '2 pieces · Refrigerator'],
    [{ quantity: '0.750', storageId: 'pantry', backendStorageLocation: 'PANTRY' }, '0.75', 'كغ', 'خزانة الطعام', '0.75 kg · Pantry'],
    [{ quantity: '2.000', unitId: null, storageId: null, backendUnit: 'TABLESPOON', backendStorageLocation: 'COUNTER', readOnly: true }, '2', 'م.ك', 'على الرخامة', '2 tbsp · Counter'],
  ]) {
    const h = uiHarness(), raw = { ...item, ...overrides };
    h.set({ items: [raw], detail: { id: item.id, status: 'ready', item: raw } });
    const englishRow = h.nodes(h.render(), 'ActionRow')[0];
    assert.equal(englishRow.props.subtitle, english);
    assert.equal(englishRow.props.trailing.props.children, '›');
    const englishHeader = h.nodes(h.render('BackendFoodDetailScreen'), 'PageHeader')[0];
    assert.equal(englishHeader.props.subtitle, english.split(' · ')[0]);

    h.language('ar');
    const arabicRow = h.nodes(h.render(), 'ActionRow')[0];
    assert.equal(arabicRow.props.subtitle, undefined);
    const runs = h.nodes(arabicRow, 'AppText').slice(0, 4);
    assert.deepEqual(runs.map(node => node.props.children), [quantity, unit, '·', storage]);
    assert.equal(runs[0].props.style.writingDirection, 'ltr');
    assert.equal(runs[1].props.style.writingDirection, 'rtl');
    for (const view of h.nodes(arabicRow, 'View')) {
      assert.equal(view.props.style.direction, 'ltr');
      assert.equal(view.props.style.flexDirection, 'row');
    }
    assert.equal(h.nodes(arabicRow, 'View')[0].props.style.justifyContent, 'flex-end');
    assert.deepEqual(h.nodes(h.nodes(arabicRow, 'View')[1], 'AppText').map(node => node.props.children), [quantity, unit]);
    assert(!runs.some(node => /[\u2066-\u2069]/.test(node.props.children)));

    const arabicDetail = h.render('BackendFoodDetailScreen');
    assert.equal(h.nodes(arabicDetail, 'PageHeader')[0].props.subtitle, undefined);
    assert.deepEqual(h.nodes(arabicDetail, 'AppText').slice(0, 2).map(node => node.props.children), [quantity, unit]);
    assert(h.nodes(arabicDetail, 'AppText').slice(0, 2).every(node => node.props.variant === 'body'));
  }
});

test('flag off routes preserve original components; flag on also guards direct add/edit URLs', () => {
  for (const [file, local, backend] of [
    ['(tabs)/index.tsx', '@/screens/home-screen', 'BackendHomeScreen'],
    ['(tabs)/kitchen.tsx', '@/screens/kitchen-screen', 'BackendKitchenScreen'],
    ['food/[id].tsx', '@/screens/food-detail-screen', 'BackendFoodDetailScreen'],
    ['(tabs)/add.tsx', '@/screens/food-entry-chooser', 'BackendWritesUnavailableScreen'],
    ['food-entry.tsx', '@/screens/food-entry-chooser', 'BackendWritesUnavailableScreen'],
    ['food/manual.tsx', '@/screens/food-form-screen', 'BackendWritesUnavailableScreen'],
    ['food/edit/[id].tsx', '@/screens/food-form-screen', 'BackendWritesUnavailableScreen'],
  ]) {
    let enabled = false;
    const exported = {};
    const code = ts.transpileModule(fs.readFileSync(`src/app/${file}`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'exports', code)(id => {
      if (id === '@/services/inventory-feature') return { isBackendInventoryEnabled: () => enabled };
      if (id === '@/screens/backend-kitchen-screen') return Object.fromEntries(['BackendKitchenScreen', 'BackendHomeScreen', 'BackendFoodDetailScreen', 'BackendWritesUnavailableScreen'].map(name => [name, name]));
      if (id === local) return { __esModule: true, default: 'LocalScreen' };
      if (id === 'expo-router') return { useLocalSearchParams: () => ({ id: 'local-id' }) };
      if (id === '@/domain/inventory') return { isPhotoRef: () => false };
      return require(id);
    }, exported);
    assert.equal(exported.default().type, 'LocalScreen', file);
    enabled = true; assert.equal(exported.default().type, backend, file);
  }
});
