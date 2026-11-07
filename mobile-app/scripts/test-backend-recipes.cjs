const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createGraphqlRecipeRepository, recipeReadOperations } = require('../src/repositories/graphql-recipe-repository.ts');
const { resolveActiveHousehold } = require('../src/services/active-household-service.ts');
const { BackendRecipesStore, visibleRecipes, emptyRecipes } = require('../src/repositories/backend-recipes-store.ts');
const view = require('../src/utils/backend-recipe-view.ts');
const { cookedItMessages } = require('../src/i18n/cooked-it.ts');
const { cookingMessages } = require('../src/i18n/cooking.ts');
const cookingUtils = require('../src/utils/cooking-session.ts');
const { backendRecipeMessages: messages } = require('../src/i18n/backend-recipes.ts');
const { loadCachedCatalogArabicNames, catalogArabicNamesOperation } = require('../src/services/inventory-catalog-names.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const summary = id => ({ id, name: `Recipe ${id}`, description: 'English description.', servings: 4, prepTimeMin: 5, cookTimeMin: 10, difficulty: 'EASY', cuisineId: null, cuisineName: null });
const food = (foodId = 'tomato') => ({ foodId, foodName: foodId });
const suggestion = (id = 'one', extra = {}) => ({ recipe: summary(id), coverageRatio: 0.5, haveCount: 1, requiredCount: 2, safetyWarnings: [],
  missing: [food()], expired: [], short: [], unknown: [], assumedStaples: [], optional: [], expiringSoon: [{ ...food(), expiryDay: '2026-06-03' }], ...extra });
const page = (nodes = [suggestion()], hasNextPage = false, endCursor = null) => ({ nodes, hasNextPage, endCursor, totalCount: 2 });
const readPage = (nodes = [suggestion()], extra = {}) => ({ ...page(nodes), today: '2026-06-02', restarted: false, ...extra });
const ingredient = (foodId = 'tomato', unit = 'GRAM', optional = false) => ({ ...food(foodId), id: foodId, quantity: '2.000', unit, optional });
const detail = (id = 'one') => ({ ...summary(id), ingredients: [ingredient()], steps: [{ id: 'step', stepNumber: 1, instruction: 'English instruction.', durationMin: 3 }] });
const flag = process.env.EXPO_PUBLIC_BACKEND_INVENTORY;
test.beforeEach(() => { delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY; });
test.after(() => { if (flag === undefined) delete process.env.EXPO_PUBLIC_BACKEND_INVENTORY; else process.env.EXPO_PUBLIC_BACKEND_INVENTORY = flag; });

function harness({ pages = [page()], recipe = detail(), catalog, transport } = {}) {
  let revision = 1, userId = 'user-a', index = 0;
  const calls = [], values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const auth = {
    getIdentityContext: async () => ({ userId, revision, backendUrl: 'http://backend.invalid' }),
    getIdentityRevision: () => revision,
    authenticatedGraphql: async (query, variables, household) => {
      calls.push({ query, variables, household });
      if (query.includes('query MyHouseholds')) return { myHouseholds: ['home-a', 'home-b'].map(id => ({ household: { id, name: id, timezone: 'Africa/Cairo' } })) };
      if (query.includes('CatalogArabicNames')) {
        if (catalog) return catalog(variables);
        return { foods: { nodes: [{ id: 'tomato', aliases: [{ alias: 'عربي tomato', languageCode: 'ar', isPrimary: true }] }], hasNextPage: false, endCursor: null } };
      }
      if (transport) return transport({ query, variables, household });
      if (query === recipeReadOperations.list) {
        const result = pages[index++]; if (result instanceof Error) throw result;
        return { recipeSuggestions: result };
      }
      if (query === recipeReadOperations.get) return { recipe };
      throw new Error(`Unexpected operation: ${query}`);
    },
  };
  return { auth, storage, calls, repository: createGraphqlRecipeRepository(auth, storage),
    switchUser: () => { revision++; userId = 'user-b'; },
    switchHousehold: async () => { for (const key of values.keys()) values.set(key, 'home-b'); await resolveActiveHousehold(auth, storage); },
  };
}
const stale = () => Object.assign(new Error('Restart pagination'), { codes: ['STALE_RECIPE_SUGGESTIONS_CURSOR'] });

test('recipe pages attach the household, preserve the connection and reuse catalog Arabic aliases', async () => {
  const h = harness({ pages: [page([suggestion('one')], true, 'next'), page([suggestion('two')])] });
  const first = await h.repository.list(); const last = await h.repository.list(first.endCursor);
  assert.equal(first.nodes[0].missing[0].arabicName, 'عربي tomato'); assert.equal(last.nodes[0].recipe.id, 'two');
  assert.equal(first.hasNextPage, true); assert.equal(last.hasNextPage, false);
  const requests = h.calls.filter(c => c.query === recipeReadOperations.list);
  assert.deepEqual(requests.map(c => c.variables.after), [null, 'next']); assert(requests.every(c => c.household === 'home-a'));
  assert.equal(h.calls.filter(c => c.query === catalogArabicNamesOperation).length, 1, 'later pages reuse catalog names instead of exhausting the per-food resolver rate limit');
});
test('successful load-more appends after shared paginated catalog names, without per-food requests', async () => {
  const h = harness({ pages: [page([suggestion('one')], true, 'next'), page([suggestion('two')])] });
  const store = new BackendRecipesStore(() => h.repository); store.setOwner('a'); await store.refresh(); await store.loadMore();
  assert.deepEqual(store.getSnapshot().nodes.map(n => n.recipe.id), ['one', 'two']);
  assert.equal(store.getSnapshot().moreError, false);
  assert.equal(h.calls.filter(c => c.query === catalogArabicNamesOperation).length, 1);
});
test('catalog names load every page once, share concurrent reads and isolate identity changes', async () => {
  let revision = 1, calls = 0;
  const auth = { getIdentityRevision: () => revision, authenticatedGraphql: async (_query, variables) => {
    calls++; return { foods: { nodes: [{ id: variables.after ? 'b' : 'a', aliases: [{ alias: variables.after ? 'باء' : 'ألف', languageCode: 'ar', isPrimary: true }] }], hasNextPage: !variables.after, endCursor: variables.after ? null : 'next' } };
  } };
  const [a, b] = await Promise.all([loadCachedCatalogArabicNames(auth, ['a']), loadCachedCatalogArabicNames(auth, ['b'])]);
  assert.equal(a.get('a'), 'ألف'); assert.equal(b.get('b'), 'باء'); assert.equal(calls, 2);
  await loadCachedCatalogArabicNames(auth, ['a', 'b']); assert.equal(calls, 2);
  revision++; await loadCachedCatalogArabicNames(auth, ['a']); assert.equal(calls, 4);
});
test('many ingredients across recipe pages share the complete paged catalog with Kitchen', async () => {
  const { loadInventoryArabicNames } = require('../src/services/inventory-catalog-names.ts');
  const ids = Array.from({ length: 230 }, (_, i) => `food-${i}`);
  const catalogPages = [];
  const pages = Array.from({ length: 6 }, (_, i) => page([suggestion(`recipe-${i}`, {
    missing: ids.slice(i * 40, (i + 1) * 40).map(food), expiringSoon: [],
  })], i < 5, i < 5 ? `recipe-page-${i + 1}` : null));
  const h = harness({ pages, catalog: ({ after }) => {
    const start = after ? Number(after) : 0; catalogPages.push(start);
    return { foods: { nodes: ids.slice(start, start + 50).map(id => ({ id, aliases: [{ alias: `عربي ${id}`, languageCode: 'ar', isPrimary: true }] })),
      hasNextPage: start + 50 < ids.length, endCursor: start + 50 < ids.length ? String(start + 50) : null } };
  } });
  const store = new BackendRecipesStore(() => h.repository); store.setOwner('user');
  await Promise.all([store.refresh(), loadInventoryArabicNames(h.auth, ids)]);
  for (let i = 1; i < pages.length; i++) await store.loadMore();
  const state = store.getSnapshot();
  assert.equal(state.moreError, false); assert.equal(state.nodes.length, 6);
  const ingredients = state.nodes.flatMap(node => node.missing);
  assert.equal(ingredients.length, 230);
  assert(ingredients.every(item => item.arabicName === `عربي ${item.foodId}`));
  assert.deepEqual(catalogPages, [0, 50, 100, 150, 200]);
  await loadInventoryArabicNames(h.auth, ids); await h.repository.get('one');
  assert.equal(catalogPages.length, 5, 'Kitchen refresh and recipe detail reuse all five catalog pages');
  assert(h.calls.every(call => !/\bfood\(id:/.test(call.query)), 'never query per-food resolvers');
});

test('catalog name cache failures are retryable and never leave a poisoned cache', async () => {
  let calls = 0;
  const auth = { getIdentityRevision: () => 1, authenticatedGraphql: async () => {
    if (++calls === 1) throw new Error('offline');
    return { foods: { nodes: [], hasNextPage: false, endCursor: null } };
  } };
  await assert.rejects(loadCachedCatalogArabicNames(auth, ['a']), /offline/);
  assert.equal((await loadCachedCatalogArabicNames(auth, ['a'])).size, 0); assert.equal(calls, 2);
});
test('stale cursor restarts exactly once from the first page, and a second stale error surfaces', async () => {
  const h = harness({ pages: [stale(), page([suggestion('fresh')])] });
  const result = await h.repository.list('old'); assert.equal(result.restarted, true); assert.equal(result.nodes[0].recipe.id, 'fresh');
  assert.deepEqual(h.calls.filter(c => c.query === recipeReadOperations.list).map(c => c.variables.after), ['old', null]);
  const twice = harness({ pages: [stale(), stale()] }); await assert.rejects(twice.repository.list('old'), /Restart pagination/);
  assert.equal(twice.calls.filter(c => c.query === recipeReadOperations.list).length, 2);
});
test('deep-link lookup pages until found or absent, restarting the whole lookup once on stale cursor', async () => {
  const h = harness({ pages: [page([suggestion('other')], true, 'n'), stale(), page([suggestion('wanted')])] });
  assert.equal((await h.repository.findSuggestion('wanted')).recipe.id, 'wanted');
  assert.deepEqual(h.calls.filter(c => c.query === recipeReadOperations.list).map(c => c.variables.after), [null, 'n', null]);
  assert.equal(await harness({ pages: [page([])] }).repository.findSuggestion('absent'), undefined);
});
test('recipe detail uses recipe(id), exact quantities, catalog aliases and ordered steps', async () => {
  const raw = detail(); raw.ingredients[0].unit = 'TABLESPOON'; raw.steps.unshift({ id: 'second', stepNumber: 2, instruction: 'Second.', durationMin: 0 });
  const h = harness({ recipe: raw }); const result = await h.repository.get('one');
  assert.equal(result.ingredients[0].unit, 'TABLESPOON'); assert.equal(result.ingredients[0].quantity, '2.000');
  assert.equal(result.ingredients[0].arabicName, 'عربي tomato'); assert.deepEqual(result.steps.map(s => s.stepNumber), [1, 2]);
  assert.equal(h.calls.find(c => c.query === recipeReadOperations.get).household, 'home-a');
});
for (const mode of ['identity', 'household']) test(`recipe reads discard responses after a ${mode} change`, async () => {
  const response = deferred(); const h = harness({ transport: async () => response.promise });
  const pending = h.repository.list(); await tick();
  if (mode === 'identity') h.switchUser(); else await h.switchHousehold();
  response.resolve({ recipeSuggestions: page() }); await assert.rejects(pending, error => error.code === 'STALE_CONTEXT');
});
test('identity changes during catalog alias loading discard metadata and data together', async () => {
  const alias = deferred(), h = harness({ catalog: () => alias.promise });
  const pending = h.repository.list(); await tick(); h.switchUser(); alias.resolve({ foods: { nodes: [{ id: 'tomato', aliases: [] }], hasNextPage: false, endCursor: null } });
  await assert.rejects(pending, error => error.code === 'STALE_CONTEXT');
});
test('recipe errors and malformed/repeated pagination surface without samples or infinite loops', async () => {
  await assert.rejects(harness({ pages: [new Error('offline')] }).repository.list(), /offline/);
  await assert.rejects(harness({ pages: [page([], true, 'same')] }).repository.list('same'), error => error.code === 'INVALID_RESPONSE');
  await assert.rejects(harness({ pages: [page([suggestion('a')], true, 'a'), page([suggestion('b')], true, 'b'), page([suggestion('a')], true, 'a')] }).repository.findSuggestion('never'), error => error.code === 'INVALID_RESPONSE');
});
test('flag false does no recipe repository auth/storage/network work', () => {
  process.env.EXPO_PUBLIC_BACKEND_INVENTORY = 'false';
  const no = new Proxy({}, { get: () => assert.fail('Flag off must stay local') });
  assert.equal(createGraphqlRecipeRepository(no, no), undefined);
});
test('recipe documents validate against the real backend schema and normal complexity limit', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const query of [...Object.values(recipeReadOperations), catalogArabicNamesOperation]) assert.deepEqual(validate(schema, parse(query)), []);
  const { complexityLimit } = (() => {
    const output = ts.transpileModule(fs.readFileSync('../backend/src/platform/graphql/complexity-limit.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {}; new Function('require', 'exports', output)(id => id === 'graphql' ? require('../../backend/node_modules/graphql') : require(id), exports); return exports;
  })();
  assert.deepEqual(validate(schema, parse(recipeReadOperations.list), [complexityLimit(2000)]), []);
});

test('Cooking reuses loaded or in-flight recipe detail; no stock operation is called', async () => {
  let reads = 0; const pending = deferred();
  const repository = { get: async () => { reads++; return pending.promise; }, findSuggestion: async () => suggestion() };
  const store = new BackendRecipesStore(() => new Proxy(repository, { get: (target, key) => { assert(key in target, `Unexpected operation ${String(key)}`); return target[key]; } }));
  store.setOwner('a'); const fromDetail = store.loadDetail('one'); await store.ensureDetail('one');
  assert.equal(reads, 1); pending.resolve(detail()); await fromDetail;
  await store.ensureDetail('one'); assert.equal(reads, 1);
  assert.equal(store.getSnapshot().detail.suggestion.recipe.id, 'one');
});

test('backend Cooking progress is memory-only, isolated by recipe and identity, and cleared on sign-out/account switch', () => {
  const store = new BackendRecipesStore(() => assert.fail('Progress never accesses the backend'));
  store.setCookingIdentity('user-a:1');
  store.updateCookingSession('user-a:1', 'one', s => cookingUtils.advanceCooking(s, 3));
  assert.equal(store.getCookingSession('user-a:1', 'one').current, 1);
  assert.equal(store.getCookingSession('user-a:1', 'two'), cookingUtils.initialCookingSession);
  store.setCookingIdentity('user-a:1'); assert.equal(store.getCookingSession('user-a:1', 'one').current, 1);
  store.setCookingIdentity('user-b:2');
  assert.equal(store.getCookingSession('user-a:1', 'one'), cookingUtils.initialCookingSession);
  store.updateCookingSession('user-a:1', 'one', () => assert.fail('Late previous-user update'));
  assert.equal(store.getCookingSession('user-b:2', 'one'), cookingUtils.initialCookingSession);
  store.updateCookingSession('user-b:2', 'one', s => cookingUtils.advanceCooking(s, 1));
  store.setCookingIdentity(null); store.setCookingIdentity('user-b:2');
  assert.equal(store.getCookingSession('user-b:2', 'one'), cookingUtils.initialCookingSession);
  store.setCookingIdentity('user-a:3'); assert.equal(store.getCookingSession('user-a:3', 'one'), cookingUtils.initialCookingSession);
});

test('Home and Recipes share one initial list and loaded pages; inventory writes refresh the shared list', async () => {
  let calls = 0; const response = deferred();
  const store = new BackendRecipesStore(() => ({ list: async () => { calls++; return calls === 1 ? response.promise : readPage([suggestion('updated')]); } }));
  store.setOwner('user'); store.inventoryChanged('initial');
  const home = store.ensureLoaded(); await store.ensureLoaded();
  assert.equal(calls, 1); response.resolve(readPage()); await home;
  await store.ensureLoaded(); await store.ensureLoaded(); assert.equal(calls, 1);
  for (const action of ['add', 'used', 'discard', 'fix', 'mistake']) {
    store.inventoryChanged(action); await tick(); assert.equal(store.getSnapshot().nodes[0].recipe.id, 'updated');
  }
  assert.equal(calls, 6);
  store.setOwner(null); await store.ensureLoaded(); assert.equal(calls, 6); assert.deepEqual(store.getSnapshot().nodes, []);
});

test('recipe store handles loading, empty, errors, retry, append and stale restart replacement', async () => {
  let response = deferred(); const calls = [];
  const store = new BackendRecipesStore(() => ({ list: after => { calls.push(after); return response.promise; } }));
  store.setOwner('a'); let pending = store.refresh(); assert.equal(store.getSnapshot().status, 'loading');
  response.resolve(readPage([suggestion('old')], { hasNextPage: true, endCursor: 'old-next' })); await pending;
  response = deferred(); pending = store.loadMore(); assert.equal(store.getSnapshot().loadingMore, true);
  response.resolve(readPage([suggestion('fresh')], { restarted: true })); await pending;
  assert.deepEqual(store.getSnapshot().nodes.map(n => n.recipe.id), ['fresh']); assert.deepEqual(calls, [undefined, 'old-next']);
  response = deferred(); pending = store.refresh(); response.reject(new Error('offline')); await pending;
  assert.equal(store.getSnapshot().status, 'error'); assert.deepEqual(store.getSnapshot().nodes, []);
  response = deferred(); pending = store.refresh(); response.resolve(readPage([])); await pending;
  assert.equal(store.getSnapshot().status, 'ready'); assert.deepEqual(store.getSnapshot().nodes, []);
});
test('store appends pages once, blocks concurrent load-more and shows retry without hiding existing rows', async () => {
  const more = deferred(); let count = 0;
  const store = new BackendRecipesStore(() => ({ list: async () => ++count === 1 ? readPage([suggestion('a')], { hasNextPage: true, endCursor: 'n' }) : more.promise }));
  store.setOwner('a'); await store.refresh(); const pending = store.loadMore(); await store.loadMore(); assert.equal(count, 2);
  more.reject(new Error('offline')); await pending;
  assert.equal(store.getSnapshot().moreError, true); assert.equal(store.getSnapshot().nodes[0].recipe.id, 'a');
});
test('account/household transitions mask rows synchronously and discard late lists/details', async () => {
  const list = deferred(), get = deferred();
  const store = new BackendRecipesStore(() => ({ list: () => list.promise, get: () => get.promise, findSuggestion: async () => suggestion() }));
  store.setOwner('user:home-a'); const pending = store.refresh(), detailPending = store.loadDetail('one');
  assert.deepEqual(visibleRecipes(store.getSnapshot(), 'user:home-b', false).nodes, []);
  store.setOwner('user:home-b'); list.resolve(readPage()); get.resolve(detail()); await Promise.all([pending, detailPending]);
  assert.deepEqual(store.getSnapshot().nodes, []); assert.equal(store.getSnapshot().detail, null);
  assert.equal(visibleRecipes(store.getSnapshot(), null, false).status, 'signed-out');
  assert.equal(visibleRecipes(store.getSnapshot(), 'other', true).status, 'loading');
  store.setOwner(null); assert.deepEqual(store.getSnapshot(), emptyRecipes);
});
test('deep-link detail renders recipe before lookup, retains it on match error, and never fabricates statuses', async () => {
  const match = deferred();
  const store = new BackendRecipesStore(() => ({ get: async () => detail(), findSuggestion: () => match.promise }));
  store.setOwner('a'); const pending = store.loadDetail('one'); await tick();
  assert.equal(store.getSnapshot().detail.recipe.id, 'one'); assert.equal(store.getSnapshot().detail.matchingLoading, true);
  match.reject(new Error('offline')); await pending;
  assert.equal(store.getSnapshot().detail.matchingError, true); assert.equal(store.getSnapshot().detail.suggestion, undefined);
});
test('detail uses the current list suggestion and all inventory invalidations refresh visited recipes', async () => {
  let reads = 0, gets = 0;
  const store = new BackendRecipesStore(() => ({ list: async () => { reads++; return readPage(); }, get: async () => { gets++; return detail(); }, findSuggestion: async () => suggestion() }));
  store.setOwner('a'); await store.refresh(); await store.loadDetail('one');
  assert.equal(store.getSnapshot().detail.suggestion.recipe.id, 'one');
  for (const key of ['add', 'used', 'discard', 'fix', 'mistake']) { store.inventoryChanged(key); await tick(); }
  assert.equal(reads, 6); assert.equal(gets, 6);
  store.inventoryChanged('mistake'); await tick(); assert.equal(reads, 6);
});

test('recipe display covers every ingredient status and all backend units without floating-point formatting', () => {
  const node = suggestion('one', { missing: [food('missing')], short: [{ ...food('short'), missingAmount: '0.750', unit: 'KILOGRAM' }], unknown: [food('unknown')], assumedStaples: [food('salt')] });
  assert.equal(view.recipeIngredientStatus(ingredient('enough'), node, 'en'), 'Have');
  assert.equal(view.recipeIngredientStatus(ingredient('short'), node, 'en'), 'Short by 0.75 kg');
  assert.equal(view.recipeIngredientStatus(ingredient('missing'), node, 'en'), 'Missing');
  assert.equal(view.recipeIngredientStatus(ingredient('unknown'), node, 'en'), 'Quantity not checked');
  assert.equal(view.recipeIngredientStatus(ingredient('salt'), node, 'en'), 'Assumed staple');
  assert.equal(view.recipeIngredientStatus(ingredient('optional', 'GRAM', true), node, 'en'), 'Optional');
  assert.equal(view.recipeIngredientStatus(ingredient(), undefined, 'en'), null);
  for (const [unit, label] of Object.entries({ GRAM: 'g', KILOGRAM: 'kg', MILLILITER: 'ml', LITER: 'L', PIECE: 'pieces', CUP: 'cups', TABLESPOON: 'tbsp', TEASPOON: 'tsp' })) assert.equal(view.recipeQuantity('2.000', unit, 'en'), `2 ${label}`);
  assert.equal(view.recipeQuantity('2.000', 'TABLESPOON', 'ar'), '\u20662\u2069 م.ك');
  assert.equal(view.recipeQuantity('0.750', 'TEASPOON', 'ar'), '\u20660.75\u2069 م.ص');
});
test('recipe count units use English singular/plural and Arabic plural categories, including short amounts', () => {
  for (const [unit, singular, plural] of [['PIECE', 'piece', 'pieces'], ['CUP', 'cup', 'cups']]) {
    for (const [amount, label] of [['1.000', singular], ['2.000', plural], ['0.500', plural], ['0', plural]]) {
      assert.equal(view.recipeQuantity(amount, unit, 'en'), `${amount === '1.000' ? '1' : amount === '2.000' ? '2' : amount === '0.500' ? '0.5' : '0'} ${label}`);
    }
  }
  for (const [amount, pieces, cups] of [['0', 'قطع', 'أكواب'], ['1', 'قطعة', 'كوب'], ['2', 'قطعتان', 'كوبان'], ['3', 'قطع', 'أكواب'], ['11', 'قطعة', 'كوب'], ['100', 'قطعة', 'كوب'], ['0.5', 'قطعة', 'كوب']]) {
    assert.equal(view.recipeQuantity(amount, 'PIECE', 'ar'), `\u2066${amount}\u2069 ${pieces}`);
    assert.equal(view.recipeQuantity(amount, 'CUP', 'ar'), `\u2066${amount}\u2069 ${cups}`);
  }
  const node = suggestion('one', { short: [{ ...food(), missingAmount: '1.000', unit: 'PIECE' }] });
  assert.equal(view.recipeIngredientStatus(ingredient(), node, 'en'), 'Short by 1 piece');
  assert.equal(view.recipeIngredientStatus(ingredient(), node, 'ar'), 'ينقصك \u20661\u2069 قطعة');
});

test('expired foods stay separate from missing on cards and required/optional detail rows in both languages', async () => {
  const expired = { ...food('expired'), arabicName: 'طماطم' };
  const h = harness({ pages: [page([suggestion('one', { missing: [], expired: [food()], expiringSoon: [] })])] });
  assert.equal((await h.repository.list()).nodes[0].expired[0].arabicName, 'عربي tomato');
  const node = suggestion('one', { missing: [food('absent')], expired: [expired], optional: [{ ...food('optional'), status: 'EXPIRED' }] });
  for (const language of ['en', 'ar']) {
    const text = language === 'en' ? 'Expired: Expired' : 'منتهي الصلاحية: طماطم';
    assert.equal(view.recipeExpired(node, language), text);
    assert.equal(view.recipeIngredientStatus(ingredient('expired'), node, language), messages[language].EXPIRED);
    assert.equal(view.recipeIngredientStatus(ingredient('optional', 'GRAM', true), node, language), messages[language].EXPIRED);
    assert.equal(view.recipeIngredientStatus(ingredient('absent'), node, language), messages[language].MISSING);
    const screen = ui(); screen.language(language); screen.set({ nodes: [node] });
    const texts = nodes(screen.render(), 'AppText').map(n => n.props.children);
    assert(texts.indexOf(view.recipeMissing(node, language)) < texts.indexOf(text));
    screen.set({ detail: { id: 'one', status: 'ready', recipe: { ...detail(), ingredients: [{ ...ingredient('expired'), foodName: 'tomato' }, ingredient('optional', 'GRAM', true)] }, suggestion: node } });
    assert.equal(nodes(screen.render(true), 'AppText').filter(n => n.props.children === messages[language].EXPIRED).length, 2);
  }
  assert.equal(view.recipeExpired(suggestion(), 'en'), null);
});

test('card explanations use Arabic ingredient names, only three missing names, calendar expiry and unchanged English recipe text', () => {
  const node = suggestion('one', { missing: ['a', 'b', 'c', 'd', 'e'].map(id => ({ ...food(id), arabicName: `عربي ${id}` })) });
  assert.equal(view.recipeMissing(node, 'en'), 'Missing: A, B, C · +2');
  assert(view.recipeMissing(node, 'ar').includes('عربي a، عربي b، عربي c')); assert(!view.recipeMissing(node, 'ar').includes('عربي d'));
  assert.equal(view.recipeCoverage(node, 'en'), 'You have 1 of 2');
  for (const [today, label] of [['2026-06-03', 'today'], ['2026-06-02', 'tomorrow'], ['2026-06-01', 'in 2 days']]) assert.equal(view.recipeExpiry(node, today, 'en'), `Uses your Tomato, expires ${label}`);
  assert.equal(view.recipeFoodName({ ...food(), arabicName: 'طماطم' }, 'ar'), 'طماطم');
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ar).sort());
});

function recipeCardModule(mocks) {
  return loadTsx('src/components/recipe-card.tsx', { ...mocks, 'react-native': { ...mocks['react-native'], ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'expo-image': { Image: 'Image' }, '@/theme/tokens': { ...mocks['@/theme/tokens'], layout: { maxWidth: 720 } } });
}
function loadTsx(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(id => id in mocks ? mocks[id] : require('./native-ui-fixture.cjs').fixtureModule(id, {}) ?? require(id), exports);
  return exports;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(n => nodes(n, type));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type), ...nodes(tree.props?.action, type)];
}
function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props.children), action: expand(tree.props.action) } };
}
function ui() {
  let language = 'en', state = { ...emptyRecipes, owner: 'a', status: 'ready', nodes: [suggestion()], today: '2026-06-02', kitchenEmpty: false };
  const pushed = [], focused = []; let refresh = 0, more = 0, get = 0;
  const react = { useCallback: callback => callback };
  const mocks = {
    react,
    'expo-router': { router: { push: route => pushed.push(route), replace: route => pushed.push(route), canGoBack: () => false }, useFocusEffect: effect => focused.push(effect) },
    'react-native': Object.fromEntries(['View', 'Pressable', 'RefreshControl', 'ActivityIndicator'].map(key => [key, key])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/brand': { Brand: 'Brand' },
    '@/components/ui/core': { ...Object.fromEntries(['AppText', 'Badge', 'Button', 'Card', 'EmptyState', 'PageHeader', 'Screen', 'SectionHeader'].map(key => [key, key])), uiStyles: {} },
    '@/components/ui/icon': { Icon: 'Icon' },
    '@/providers/backend-recipes-provider': { useBackendRecipes: () => ({ ...state, ensureLoaded: () => { refresh++; }, refresh: () => { refresh++; }, loadMore: () => { more++; }, loadDetail: () => { get++; }, ensureDetail: () => { get++; } }) },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) }, '@/theme/tokens': { radii: {}, spacing: {} },
    '@/i18n/backend-recipes': { backendRecipeMessages: messages }, '@/i18n/cooking': { cookingMessages }, '@/i18n/cooked-it': { cookedItMessages }, '@/utils/backend-recipe-view': view,
  };
  mocks['@/domain/cooked-it'] = require('../src/domain/cooked-it.ts');
  mocks['@/data/cookbook-content'] = { getCookbookContent: () => undefined };
  mocks['@/components/recipe-placeholder'] = loadTsx('src/components/recipe-placeholder.tsx', mocks);
  const exported = loadTsx('src/screens/backend-recipes-screen.tsx', mocks);
  return { pushed, set: update => { state = { ...state, ...update }; }, language: value => { language = value; },
    render: (detail = false) => expand(detail ? exported.BackendRecipeDetailScreen({ id: 'one' }) : exported.BackendRecipesScreen()),
    focus: () => focused.at(-1)(), counts: () => ({ refresh, more, get }), mocks };
}
test('backend recipe list signed-out/loading/empty/error/retry states work in English and Arabic', () => {
  const h = ui();
  for (const language of ['en', 'ar']) {
    h.language(language); h.set({ status: 'signed-out', owner: null }); let tree = h.render();
    assert.equal(nodes(tree, 'EmptyState')[0].props.title, messages[language].signInTitle);
    assert.equal(nodes(tree, 'Pressable').length, 0); nodes(tree, 'EmptyState')[0].props.onPress(); assert.equal(h.pushed.at(-1), '/login');
    h.set({ status: 'loading', owner: 'a' }); tree = h.render(); assert.equal(nodes(tree, 'ActivityIndicator').length, 1);
    h.set({ status: 'error' }); tree = h.render(); nodes(tree, 'Button').find(n => n.props.label === messages[language].retry).props.onPress();
    h.set({ status: 'ready', nodes: [] }); tree = h.render(); assert.equal(nodes(tree, 'EmptyState')[0].props.title, messages[language].empty);
    nodes(tree, 'EmptyState')[0].props.onPress(); assert.equal(h.pushed.at(-1), '/food-entry');
  }
  assert.equal(h.counts().refresh, 2);
});
test('backend recipe cards show server names, coverage, missing/expiry explanations, metadata and neutral images', () => {
  const h = ui(), node = suggestion('one', { safetyWarnings: ['DISLIKE_FOOD'], missing: [{ ...food(), arabicName: 'طماطم' }], expiringSoon: [{ ...food(), arabicName: 'طماطم', expiryDay: '2026-06-03' }] });
  h.set({ nodes: [node], hasNextPage: true }); let tree = h.render();
  const text = JSON.stringify(tree); assert(text.includes('You have 1 of 2')); assert(text.includes('Missing: Tomato')); assert(text.includes('Uses your Tomato, expires tomorrow'));
  assert(text.includes('15 min · Easy · Servings: 4')); assert.equal(nodes(tree, 'Badge')[0].props.label, messages.en.warnings);
  assert.equal(nodes(tree, 'View').find(n => n.props.accessibilityRole === 'image').props.accessibilityLabel, messages.en.placeholder);
  assert(!text.includes('unsplash')); assert(!text.includes('sample recipes'));
  nodes(tree, 'Pressable')[0].props.onPress(); assert.deepEqual(h.pushed.at(-1), { pathname: '/recipes/[id]', params: { id: 'one' } });
  nodes(tree, 'Button').find(n => n.props.label === messages.en.more).props.onPress();
  nodes(tree, 'Screen')[0].props.refreshControl.props.onRefresh(); assert.deepEqual(h.counts(), { refresh: 1, more: 1, get: 0 });
  h.language('ar'); tree = h.render(); assert.equal(nodes(tree, 'Screen')[0].props.rtl, true);
  assert(JSON.stringify(tree).includes('طماطم')); assert(!JSON.stringify(tree).includes('Missing:'));
  const name = nodes(tree, 'AppText').find(n => n.props.children === node.recipe.name); assert.equal(name.props.dir, 'ltr');
  assert(nodes(tree, 'AppText').filter(n => typeof n.props.children === 'string' && n.props.children.includes('طماطم')).every(n => n.props.dir === 'rtl'));
});
test('empty Kitchen hides unmatched server cards; load-more errors retain cards and disable duplicate submission', () => {
  const h = ui(); h.set({ kitchenEmpty: true }); assert.equal(nodes(h.render(), 'Pressable').length, 0);
  h.set({ kitchenEmpty: false, hasNextPage: true, moreError: true }); let tree = h.render();
  assert.equal(nodes(tree, 'Pressable').length, 1); assert(nodes(tree, 'AppText').some(n => n.props.children === messages.en.moreError));
  h.set({ loadingMore: true }); tree = h.render(); assert(nodes(tree, 'Button').some(n => n.props.disabled === true));
});
test('backend detail shows every ingredient status, tbsp/tsp, ordered English content, safety warnings and Start cooking', () => {
  const h = ui();
  const recipe = { ...detail(), ingredients: [ingredient('have', 'TABLESPOON'), ingredient('short', 'KILOGRAM'), ingredient('missing'), ingredient('unknown'), ingredient('salt'), ingredient('optional', 'TEASPOON', true)] };
  const node = suggestion('one', { missing: [food('missing')], short: [{ ...food('short'), missingAmount: '0.750', unit: 'KILOGRAM' }], unknown: [food('unknown')], assumedStaples: [food('salt')], safetyWarnings: ['DISLIKE_FOOD'] });
  h.set({ detail: { id: 'one', status: 'ready', recipe, suggestion: node } });
  for (const language of ['en', 'ar']) {
    h.language(language); const tree = h.render(true), text = JSON.stringify(tree);
    for (const key of ['ENOUGH', 'MISSING', 'UNKNOWN', 'ASSUMED', 'optional']) assert(text.includes(messages[language][key]));
    assert(text.includes(language === 'en' ? 'Short by 0.75 kg' : 'ينقصك'));
    assert(text.includes(language === 'en' ? '2 tbsp' : 'م.ك')); assert(text.includes(language === 'en' ? '2 tsp' : 'م.ص'));
    assert(nodes(tree, 'AppText').some(n => n.props.children === 'English instruction.' && n.props.dir === 'ltr'));
    assert(nodes(tree, 'AppText').some(n => n.props.children === 'English description.' && n.props.dir === 'ltr'));
    nodes(tree, 'Button').find(n => n.props.label === cookingMessages[language].start).props.onPress();
    assert.deepEqual(h.pushed.at(-1), { pathname: '/cooking/[id]', params: { id: 'one' } });
    assert(nodes(tree, 'Badge').some(n => n.props.label === messages[language].warnings));
  }
});
test('backend detail without a suggestion shows no inferred statuses; lookup failures show Retry', () => {
  const h = ui(); h.set({ detail: { id: 'one', status: 'ready', recipe: detail() } }); let tree = h.render(true);
  assert(JSON.stringify(tree).includes(messages.en.matchingUnavailable)); assert(!nodes(tree, 'AppText').some(n => n.props.children === messages.en.ENOUGH));
  h.set({ detail: { id: 'one', status: 'ready', recipe: detail(), matchingError: true } }); tree = h.render(true);
  nodes(tree, 'Button').find(n => n.props.label === messages.en.retry).props.onPress(); assert.equal(h.counts().get, 1);
  h.set({ status: 'error' }); assert(JSON.stringify(h.render(true)).includes('English description.'));
});
function cookingUi() {
  const h = ui(), effects = []; let progress = cookingUtils.initialCookingSession; let hook = 0; const store = [];
  h.mocks.react.useEffect = effect => effects.push(effect);
  h.mocks.react.useState = init => { const i = hook++; if (!(i in store)) store[i] = init; return [store[i], value => { store[i] = typeof value === 'function' ? value(store[i]) : value; }]; };
  h.mocks.react.useRef = value => ({ current: value });
  Object.assign(h.mocks['react-native'], { ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 400, height: 800 }) });
  h.mocks['react-native-reanimated'] = { useReducedMotion: () => false };
  h.mocks['expo-keep-awake'] = { useKeepAwake: () => {} };
  h.mocks['@/components/step-timer'] = { StepTimer: 'StepTimer' };
  h.mocks['@/components/ui/core'].Chip = 'Chip';
  h.mocks['expo-router'].useLocalSearchParams = () => ({ id: 'one' });
  h.mocks['@/utils/cooking-session'] = cookingUtils;
  h.mocks['@/providers/backend-recipes-provider'].useBackendCookingSession = () => ({ session: progress, update: change => { progress = change(progress); } });
  const { BackendCookingScreen } = loadTsx('src/screens/backend-cooking-screen.tsx', h.mocks);
  return { ...h, renderDetail: h.render, render: () => { hook = 0; return expand(BackendCookingScreen()); }, start: () => effects.at(-1)(), progress: () => progress };
}

test('backend Cooking orders English steps and durations, shows every read-only checklist status, and completes without stock writes', () => {
  for (const language of ['en', 'ar']) {
    const h = cookingUi(); h.language(language);
    const recipe = { ...detail(), ingredients: [ingredient('have'), ingredient('short'), ingredient('missing'), ingredient('expired'), ingredient('unknown'), ingredient('salt'), ingredient('optional', 'TEASPOON', true)],
      steps: [{ id: 'second', stepNumber: 2, instruction: 'Second English step.', durationMin: null }, { id: 'first', stepNumber: 1, instruction: 'First English step.', durationMin: 5 }] };
    const node = suggestion('one', { missing: [food('missing')], expired: [food('expired')], short: [{ ...food('short'), missingAmount: '1.000', unit: 'GRAM' }], unknown: [food('unknown')], assumedStaples: [food('salt')] });
    h.set({ detail: { id: 'one', status: 'ready', recipe, suggestion: node } });
    let tree = h.render(); h.start(); assert.equal(h.counts().get, 1);
    assert(nodes(tree, 'View').some(n => n.props.style?.direction === (language === 'ar' ? 'rtl' : 'ltr')));
    const segments = () => nodes(tree, 'Pressable').filter(n => n.props.testID === 'cook-progress-segment');
    assert.equal(segments().length, 2);
    assert.equal(nodes(tree, 'StepTimer')[0].props.minutes, 5, 'the current timed step offers a timer');
    nodes(tree, 'Pressable').find(n => n.props.accessibilityRole === 'tab' && !n.props.accessibilityState.selected).props.onPress(); tree = h.render();
    for (const key of ['ENOUGH', 'MISSING', 'EXPIRED', 'UNKNOWN', 'ASSUMED', 'optional']) assert(JSON.stringify(tree).includes(messages[language][key]));
    assert(JSON.stringify(tree).includes(language === 'en' ? 'Short by 1 g' : 'ينقصك'));
    nodes(tree, 'Pressable').find(n => n.props.accessibilityRole === 'tab' && !n.props.accessibilityState.selected).props.onPress(); tree = h.render();
    assert(nodes(tree, 'AppText').some(n => n.props.children === 'First English step.' && n.props.accessibilityLiveRegion === 'polite' && n.props.dir === 'ltr'));
    assert(nodes(tree, 'AppText').some(n => n.props.children === (language === 'en' ? '5 min' : '\u20665\u2069 دقيقة')));
    assert.equal(segments()[0].props.accessibilityState.selected, true);
    assert.equal(nodes(tree, 'Button').find(n => n.props.label === cookingMessages[language].previous).props.disabled, true);
    nodes(tree, 'Button').find(n => n.props.label === cookingMessages[language].next).props.onPress(); tree = h.render();
    assert(nodes(tree, 'AppText').some(n => n.props.children === 'Second English step.' && n.props.accessibilityLiveRegion === 'polite'));
    nodes(tree, 'Button').find(n => n.props.label === cookingMessages[language].previous).props.onPress();
    assert.equal(h.progress().current, 0); tree = h.render();
    segments()[1].props.onPress(); tree = h.render();
    nodes(tree, 'Button').find(n => n.props.label === cookingMessages[language].finish).props.onPress(); tree = h.render();
    assert.equal(h.progress().finished, true);
    nodes(tree, 'Button').find(n => n.props.label === cookedItMessages[language].yes).props.onPress();
    assert.deepEqual(h.pushed.at(-1), { pathname: '/cooked-it', params: { id: 'one' } });
    nodes(tree, 'Button').find(n => n.props.label === cookedItMessages[language].notNow).props.onPress();
    assert.deepEqual(h.pushed.at(-1), { pathname: '/recipes/[id]', params: { id: 'one' } });
    assert.equal(h.counts().get, 1, 'completing and Done do not request any inventory mutation');
  }
  assert.doesNotMatch(fs.readFileSync('src/screens/backend-cooking-screen.tsx', 'utf8'), /consumeStock|adjustStock|discardStock|addStock|setInterval|setTimeout/);
});

test('backend Cooking handles signed-out/loading/error/retry and missing steps without a sample fallback', () => {
  const h = cookingUi();
  for (const language of ['en', 'ar']) {
    h.language(language); h.set({ status: 'signed-out', owner: null, detail: null });
    let tree = h.render(); assert.equal(nodes(tree, 'EmptyState')[0].props.title, messages[language].cookingSignIn);
    nodes(tree, 'EmptyState')[0].props.onPress(); assert.equal(h.pushed.at(-1), '/login');
    const before = h.counts().get; h.start(); assert.equal(h.counts().get, before);
    h.set({ status: 'loading', owner: 'a' }); assert(JSON.stringify(h.render()).includes(messages[language].loading));
    h.set({ status: 'error' }); tree = h.render(); nodes(tree, 'Button').find(n => n.props.label === messages[language].retry).props.onPress();
    h.set({ status: 'ready', detail: { id: 'one', status: 'ready', recipe: { ...detail(), steps: [] } } });
    assert.equal(nodes(h.render(), 'EmptyState')[0].props.title, cookingMessages[language].missing);
  }
  assert.equal(h.counts().get, 2);
  h.set({ detail: { id: 'one', status: 'ready', recipe: { ...detail(), steps: [] } } });
  assert(!nodes(h.renderDetail(true), 'Button').some(n => n.props.label === cookingMessages.en.start));
});

test('Cooking route uses backend for every id when enabled, including old sample ids; false uses only the original screen', () => {
  const h = ui(); let enabled = true;
  const route = loadTsx('src/screens/cooking-screen.tsx', { ...h.mocks,
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => enabled },
    '@/screens/backend-cooking-screen': { BackendCookingScreen: 'BackendCookingScreen' },
    '@/data/kitchen-demo': {}, '@/data/home-content': {}, '@/i18n/recipes': {},
    '@/services/cooking-sessions': {}, '@/utils/cooking-session': cookingUtils,
  });
  assert.equal(route.default().type, 'BackendCookingScreen');
  enabled = false; assert.equal(typeof route.default().type, 'function');
});

test('I cooked this opens confirmation without a mutation, and Removed banner appears on the returned recipe in EN/AR', () => {
  for (const language of ['en', 'ar']) {
    const h = ui(); h.language(language); h.set({ detail: { id: 'one', status: 'ready', recipe: detail(), suggestion: suggestion() }, removedNotice: { id: 1, recipeId: 'one' } });
    const tree = h.render(true);
    nodes(tree, 'Button').find(n => n.props.label === cookedItMessages[language].cooked).props.onPress();
    assert.deepEqual(h.pushed.at(-1), { pathname: '/cooked-it', params: { id: 'one' } });
    assert(nodes(tree, 'AppText').some(n => n.props.children === cookedItMessages[language].removed && n.props.accessibilityLiveRegion === 'polite'));
  }
});

test('Home recipe ideas show four ranked backend cards, metadata, coverage, expiry and detail/View all routes in EN/AR', () => {
  const h = ui(); const effects = [];
  h.mocks.react.useEffect = effect => effects.push(effect);
  h.mocks['react-native'].ScrollView = 'ScrollView';
  h.mocks['@/i18n/home'] = require('../src/i18n/home.ts');
  h.mocks['@/i18n/recipes'] = require('../src/i18n/recipes.ts');
  h.mocks['@/components/recipe-card'] = recipeCardModule(h.mocks);
  const { BackendHomeRecipeIdeas } = loadTsx('src/screens/backend-home-recipe-ideas.tsx', h.mocks);
  h.set({ nodes: Array.from({ length: 6 }, (_, i) => suggestion(`backend-${i}`, { expiringSoon: [{ ...food(), arabicName: 'طماطم', expiryDay: '2026-06-03' }] })) });
  for (const language of ['en', 'ar']) {
    h.language(language); const tree = expand(BackendHomeRecipeIdeas({ kitchenStatus: 'ready' }));
    assert.equal(nodes(tree, 'Pressable').length, 4);
    assert.equal(nodes(tree, 'View').filter(n => n.props.accessibilityRole === 'image').length, 4);
    assert(JSON.stringify(tree).includes(language === 'en' ? 'You have 1 of 2' : 'لديك'));
    assert(JSON.stringify(tree).includes(language === 'en' ? '15 min' : 'دقيقة'));
    assert(JSON.stringify(tree).includes(language === 'en' ? 'Uses your Tomato, expires tomorrow' : 'طماطم'));
    assert(!JSON.stringify(tree).includes('unsplash')); assert(!JSON.stringify(tree).includes('bowl'));
    assert(nodes(tree, 'AppText').filter(n => n.props.children === 'Recipe backend-0').every(n => n.props.dir === 'ltr'));
    nodes(tree, 'Pressable')[0].props.onPress(); assert.deepEqual(h.pushed.at(-1), { pathname: '/recipes/[id]', params: { id: 'backend-0' } });
    nodes(tree, 'Button')[0].props.onPress(); assert.deepEqual(h.pushed.at(-1), { pathname: '/feature', params: { feature: 'recipes' } });
    effects.at(-1)();
  }
  assert.equal(h.counts().refresh, 2);
});

test('Home recipe ideas signed-out, empty, quiet loading/error/retry states never fall back to samples', () => {
  const h = ui(), effects = [];
  h.mocks.react.useEffect = effect => effects.push(effect);
  h.mocks['react-native'].ScrollView = 'ScrollView';
  h.mocks['@/i18n/home'] = require('../src/i18n/home.ts'); h.mocks['@/i18n/recipes'] = require('../src/i18n/recipes.ts');
  h.mocks['@/components/recipe-card'] = recipeCardModule(h.mocks);
  const { BackendHomeRecipeIdeas } = loadTsx('src/screens/backend-home-recipe-ideas.tsx', h.mocks);
  for (const language of ['en', 'ar']) {
    h.language(language); const t = messages[language];
    h.set({ status: 'signed-out', owner: null }); let tree = expand(BackendHomeRecipeIdeas({ kitchenStatus: 'signed-out' }));
    assert(JSON.stringify(tree).includes(t.homeSignIn)); nodes(tree, 'Button')[0].props.onPress(); assert.equal(h.pushed.at(-1), '/login');
    effects.at(-1)();
    h.set({ owner: 'a', status: 'ready', kitchenEmpty: true }); tree = expand(BackendHomeRecipeIdeas({ kitchenStatus: 'ready' }));
    assert(JSON.stringify(tree).includes(t.homeEmpty)); nodes(tree, 'Button').find(n => n.props.label === t.add).props.onPress(); assert.equal(h.pushed.at(-1), '/food-entry');
    effects.at(-1)();
    h.set({ kitchenEmpty: false, nodes: [], status: 'ready' }); assert(JSON.stringify(expand(BackendHomeRecipeIdeas({ kitchenStatus: 'ready' }))).includes(t.homeEmpty));
    for (const status of ['idle', 'loading', 'error']) {
      h.set({ status }); tree = expand(BackendHomeRecipeIdeas({ kitchenStatus: 'ready' }));
      assert.equal(nodes(tree, 'Pressable').length, 0); assert.equal(nodes(tree, 'EmptyState').length, 0);
      assert(JSON.stringify(tree).includes(status === 'error' ? t.error : t.loading));
      if (status === 'error') nodes(tree, 'Button').find(n => n.props.label === t.retry).props.onPress();
    }
  }
  assert.equal(h.counts().refresh, 2, 'only the explicit error Retry fetched');
});

test('existing recipe routes select backend only with the switch on; false keeps original sample list', () => {
  const h = ui(); let enabled = true;
  const mocks = { ...h.mocks,
    react: { useState: initial => [initial, () => {}] },
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => enabled },
    '@/screens/backend-recipes-screen': { BackendRecipesScreen: 'BackendRecipesScreen', BackendRecipeDetailScreen: 'BackendRecipeDetailScreen' },
    '@/components/food-image': { FoodImage: 'FoodImage' }, '@/data/home-content': require('../src/data/home-content.ts'),
    '@/i18n/recipes': require('../src/i18n/recipes.ts'), '@/utils/recipe-view': require('../src/utils/recipe-view.ts'),
  };
  const list = loadTsx('src/screens/recipes-screen.tsx', mocks);
  assert.equal(list.default().type, 'BackendRecipesScreen');
  enabled = false; const tree = expand(list.default());
  assert.equal(nodes(tree, 'FoodImage').length, 2); assert(JSON.stringify(tree).includes('Illustrative sample recipes'));
  assert(!JSON.stringify(tree).includes('Sign in to see recipes'));
});
test('Home sample detail routes stay explicit with the flag on; backend and unknown IDs never fall back', () => {
  const h = ui(); let id = 'bowl';
  const mocks = { ...h.mocks,
    'expo-router': { useLocalSearchParams: () => ({ id }) },
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => true },
    '@/screens/backend-recipes-screen': { BackendRecipeDetailScreen: 'BackendRecipeDetailScreen' },
    '@/components/food-image': {}, '@/data/kitchen-demo': require('../src/data/kitchen-demo.ts'),
    '@/data/home-content': require('../src/data/home-content.ts'), '@/i18n/home': require('../src/i18n/home.ts'),
    '@/i18n/recipes': require('../src/i18n/recipes.ts'), '@/utils/recipe-view': require('../src/utils/recipe-view.ts'),
    '@/i18n/cooking': require('../src/i18n/cooking.ts'), '@/utils/cooking-session': require('../src/utils/cooking-session.ts'),
    '@/providers/inventory-provider': { useInventory: () => assert.fail('No local hook on the backend path') },
  };
  const route = loadTsx('src/screens/recipe-detail-screen.tsx', mocks);
  assert.equal(typeof route.default().type, 'function');
  id = 'backend-id'; assert.equal(route.default().type, 'BackendRecipeDetailScreen');
  id = 'unknown'; assert.equal(route.default().type, 'BackendRecipeDetailScreen');
});

test('Cooking hook masks a changed identity immediately and provider clears progress on switch and logout', () => {
  let user = { id: 'a' }, revision = 1; const effects = [];
  const store = new BackendRecipesStore(() => assert.fail('No network needed for Cooking progress'));
  const hooks = loadTsx('src/providers/backend-recipes-provider.tsx', {
    react: { createContext: () => ({ Provider: 'Context' }), useContext: () => store, useState: () => [store],
      useEffect: effect => effects.push(effect), useSyncExternalStore: (_s, get) => get(), useCallback: cb => cb },
    '@react-native-async-storage/async-storage': {}, '@/repositories/backend-recipes-store': { BackendRecipesStore, visibleRecipes },
    '@/repositories/graphql-recipe-repository': {}, '@/services/inventory-feature': { isBackendInventoryEnabled: () => true },
    '@/services/active-household-service': { getActiveHouseholdRevision: () => 1 },
    '@/services/auth': { getAuth: () => ({ getIdentityRevision: () => revision }) }, '@/utils/cooking-session': cookingUtils,
    './auth-provider': { useAuth: () => ({ user, ready: true, busy: false }) },
    './backend-kitchen-provider': { useBackendKitchen: () => ({ status: 'loading', items: [] }) },
  });
  const provider = () => { effects.length = 0; expand(hooks.BackendRecipesProvider({ children: null })); effects.forEach(effect => effect()); };
  provider(); const original = hooks.useBackendCookingSession('one'); original.update(s => cookingUtils.advanceCooking(s, 3));
  assert.equal(hooks.useBackendCookingSession('one').session.current, 1);
  provider(); assert.equal(hooks.useBackendCookingSession('one').session.current, 1);
  user = { id: 'b' }; revision++;
  assert.equal(hooks.useBackendCookingSession('one').session, cookingUtils.initialCookingSession);
  original.update(() => assert.fail('Stale user callback must not update progress')); provider();
  hooks.useBackendCookingSession('one').update(s => cookingUtils.advanceCooking(s, 3));
  user = null; revision++; provider();
  assert.equal(hooks.useBackendCookingSession('one').session, cookingUtils.initialCookingSession);
  user = { id: 'b' }; revision++; provider();
  assert.equal(hooks.useBackendCookingSession('one').session, cookingUtils.initialCookingSession);
});

test('Home initial ensure and provider inventory effects share one request, then Recipes reuses loaded data', async () => {
  let calls = 0; const effects = [];
  const store = new BackendRecipesStore(() => ({ list: async () => { calls++; return readPage(); } }));
  const hooks = loadTsx('src/providers/backend-recipes-provider.tsx', {
    react: { createContext: () => ({ Provider: 'RecipesContext' }), useContext: () => store,
      useState: () => [store], useEffect: effect => effects.push(effect), useSyncExternalStore: (_s, get) => get(), useCallback: cb => cb },
    '@react-native-async-storage/async-storage': {},
    '@/repositories/backend-recipes-store': { BackendRecipesStore, visibleRecipes }, '@/repositories/graphql-recipe-repository': {},
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => true },
    '@/services/active-household-service': { getActiveHouseholdRevision: () => 1 },
    '@/services/auth': { getAuth: () => ({ getIdentityRevision: () => 1 }) },
    '@/utils/cooking-session': cookingUtils,
    './auth-provider': { useAuth: () => ({ user: { id: 'user' }, ready: true, busy: false }) },
    './backend-kitchen-provider': { useBackendKitchen: () => ({ status: 'ready', today: '2026-06-02', items: [{ id: 'batch', quantity: '1', version: 1 }] }) },
  });
  expand(hooks.BackendRecipesProvider({ children: null }));
  const home = hooks.useBackendRecipes().ensureLoaded();
  effects.forEach(effect => effect()); await home;
  await hooks.useBackendRecipes().ensureLoaded();
  assert.equal(calls, 1); assert.equal(hooks.useBackendRecipes().nodes.length, 1);
});

test('recipes provider masks account/household changes before effects and flag off mounts no backend hooks', async () => {
  let auth = { user: { id: 'user' }, busy: false, ready: true, error: null }, revision = 1, householdRevision = 1, enabled = true;
  const store = new BackendRecipesStore(() => ({ list: async () => readPage() })); store.setOwner('user:1:1'); await store.refresh();
  const hooks = loadTsx('src/providers/backend-recipes-provider.tsx', {
    react: { createContext: () => ({}), useContext: () => store, useSyncExternalStore: (_s, get) => get(), useCallback: cb => cb },
    '@react-native-async-storage/async-storage': {},
    '@/repositories/backend-recipes-store': { BackendRecipesStore, visibleRecipes }, '@/repositories/graphql-recipe-repository': {},
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => enabled },
    '@/services/active-household-service': { getActiveHouseholdRevision: () => householdRevision },
    '@/services/auth': { getAuth: () => ({ getIdentityRevision: () => revision }) },
    '@/utils/cooking-session': cookingUtils,
    './auth-provider': { useAuth: () => auth }, './backend-kitchen-provider': { useBackendKitchen: () => ({ status: 'ready', items: [{}] }) },
  });
  assert.equal(hooks.useBackendRecipes().nodes.length, 1);
  householdRevision++; assert.equal(hooks.useBackendRecipes().nodes.length, 0);
  householdRevision--; revision++; assert.equal(hooks.useBackendRecipes().nodes.length, 0);
  auth = { ...auth, user: null }; assert.equal(hooks.useBackendRecipes().status, 'signed-out');
  enabled = false; assert.equal(hooks.BackendRecipesProvider({ children: 'unchanged' }), 'unchanged');
});
