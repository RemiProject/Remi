const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { kitchenView, kitchenEmptyAction, activeKitchenFilterCount, defaultKitchenFilters } = require('../src/utils/kitchen-view.ts');
const { inventoryMessages, inventoryExpirationLabel } = require('../src/i18n/inventory.ts');
const base = { categoryId: 'produce', storageId: 'refrigerator', quantity: 1, unitId: 'g', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' };
const items = [
  { ...base, id: 'z', name: 'Zucchini' }, { ...base, id: 'a', name: 'Apple', expirationDate: '2026-10-16' },
  { ...base, id: 'past', name: 'Spinach', expirationDate: '2026-10-12' },
  { ...base, id: 'far', name: 'Berries', storageId: 'freezer', expirationDate: '2026-11-01' },
];
test('Kitchen combines filters, sorts names and does not mutate inventory', () => {
  const original = JSON.stringify(items);
  assert.deepEqual(kitchenView(items, '', 'all', 'all', 'name', false, '2026-10-14', 'en').map((item) => item.id), ['a', 'far', 'past', 'z']);
  assert.equal(kitchenView(items, ' APPLE ', 'produce', 'refrigerator', 'name', false, '2026-10-14', 'en')[0], items[1]);
  assert.equal(kitchenView(items, '', 'dairy', 'freezer', 'name', false, '2026-10-14', 'en').length, 0);
  assert.equal(JSON.stringify(items), original);
});
test('expiration sort puts unknown dates last; Use First excludes unknown/later dates', () => {
  assert.deepEqual(kitchenView(items, '', 'all', 'all', 'expiry', false, '2026-10-14', 'en').map((item) => item.id), ['past', 'a', 'far', 'z']);
  assert.deepEqual(kitchenView(items, '', 'all', 'all', 'expiry', true, '2026-10-14', 'en').map((item) => item.id), ['past', 'a']);
  assert.deepEqual(kitchenView([], '', 'all', 'all', 'name', true, '2026-10-14', 'ar'), []);
});
test('inventory translations have matching keys and explicit unknown/expired labels', () => {
  assert.deepEqual(Object.keys(inventoryMessages.en).sort(), Object.keys(inventoryMessages.ar).sort());
  assert.equal(inventoryExpirationLabel(items[0], '2026-10-14', 'ar'), inventoryMessages.ar.unknown);
  assert.equal(inventoryExpirationLabel(items[2], '2026-10-14', 'en'), inventoryMessages.en.expired);
});

test('empty-state recovery clears only the responsible search or filters', () => {
  const filtered = { ...defaultKitchenFilters, category: 'dairy', storage: 'freezer', priority: true, sort: 'expiry' };
  assert.equal(activeKitchenFilterCount(filtered), 3); // Sorting is not a filtering predicate.
  assert.equal(kitchenEmptyAction(items, 'Apple', filtered, '2026-10-14', 'en'), 'filters');
  assert.equal(kitchenEmptyAction(items, 'nonexistent', filtered, '2026-10-14', 'en'), 'search');
  assert.equal(kitchenEmptyAction(items, '', filtered, '2026-10-14', 'en'), 'filters');
  assert.equal(kitchenEmptyAction(items, '', defaultKitchenFilters, '2026-10-14', 'en'), null);
});

test('Kitchen modal stages selections, cancels without applying, and clears on explicit Apply', () => {
  const slots = [];
  let cursor = 0;
  const exported = {};
  const names = ['AppText', 'Button', 'Card', 'Chip', 'EmptyState', 'PageHeader', 'Screen', 'SearchField', 'SectionHeader'];
  const code = ts.transpileModule(fs.readFileSync('src/screens/kitchen-screen.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)((id) => {
    if (id === 'react') return { useState: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; } };
    if (id === 'react-native') return { Keyboard: { dismiss: () => {} }, Modal: 'Modal', ScrollView: 'ScrollView', View: 'View' };
    if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (id === 'expo-router') return { router: {} };
    if (id === '@/components/ui/core') return { ...Object.fromEntries(names.map((name) => [name, name])), uiStyles: { row: {}, grow: {} } };
    if (id === '@/components/ui/icon') return { Icon: 'Icon' };
    if (id === '@/components/food-card') return { FoodCard: 'FoodCard' };
    if (id === '@/components/inventory-notice') return { InventoryNotice: 'InventoryNotice' };
    if (id === '@/providers/inventory-provider') return { useInventory: () => ({ items, status: 'ready' }), useToday: () => '2026-10-14' };
    if (id === '@/providers/language-provider') return { useLanguage: () => ({ language: 'en' }) };
    if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: {} }) };
    if (id === '@/theme/tokens') return { layout: {}, spacing: {} };
    if (id.startsWith('@/')) return require('../src/' + id.slice(2) + '.ts');
    return require(id);
  }, exported);
  const render = () => { cursor = 0; return exported.default(); };
  function nodes(tree, type) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, type));
    if (tree.type === 'Modal' && !tree.props.visible) return [];
    return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type), ...nodes(tree.props?.action, type)];
  }
  const button = (label) => {
    const tree = render();
    const modal = nodes(tree, 'Modal')[0];
    return nodes(modal ?? tree, 'Button').find((node) => node.props.label === label);
  };
  const filterButton = () => nodes(render(), 'Button').find((node) => node.props.icon === 'filter');
  assert.equal(nodes(render(), 'FoodCard').length, items.length);
  filterButton().props.onPress();
  nodes(render(), 'Chip').find((node) => node.props.label === 'Dairy').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, items.length); // Draft isn't applied.
  button('Close').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, items.length);
  filterButton().props.onPress();
  nodes(render(), 'Chip').find((node) => node.props.label === 'Dairy').props.onPress();
  button('Apply').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, 0);
  assert.equal(nodes(render(), 'Button').filter((node) => node.props.label === 'Clear filters').length, 1);
  filterButton().props.onPress();
  button('Clear filters').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, 0); // Still requires Apply.
  button('Apply').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, items.length);
  nodes(render(), 'SearchField')[0].props.onChangeText('nonexistent');
  assert.equal(nodes(render(), 'FoodCard').length, 0);
  button('Clear search').props.onPress();
  assert.equal(nodes(render(), 'FoodCard').length, items.length);
});

function preferenceHarness(saved, failRead = false) {
  const data = new Map([['remy.inventory', 'untouched-inventory'], ['remy.preferences.language', saved]]);
  let failWrite = false;
  const slots = [];
  let cursor = 0;
  let effect;
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useCallback: (fn) => fn,
    useEffect: (fn) => { effect ??= fn; },
    useState: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useRef: (initial) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  };
  const storage = {
    async getItem(key) { if (failRead) throw new Error('read error'); return data.get(key) ?? null; },
    async setItem(key, value) { if (failWrite) throw new Error('write error'); data.set(key, value); },
  };
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync('src/providers/language-provider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)((id) => {
    if (id === 'react') return react;
    if (id === 'react-native') return { I18nManager: { isRTL: false } };
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
    return require(id);
  }, exported);
  const render = () => { cursor = 0; return exported.LanguageProvider({ children: null }).props.value; };
  return { data, render, mount: () => effect(), setFailWrite: (value) => { failWrite = value; }, setFailRead: (value) => { failRead = value; } };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('shared language hydrates/persists without touching inventory; failed writes retain language', async () => {
  const harness = preferenceHarness('ar');
  harness.render(); harness.mount(); await tick();
  assert.equal(harness.render().language, 'ar');
  await harness.render().setLanguage('en');
  assert.equal(harness.data.get('remy.preferences.language'), 'en');
  harness.setFailWrite(true);
  await harness.render().setLanguage('ar');
  assert.equal(harness.render().language, 'en');
  assert.equal(harness.render().error, true);
  assert.equal(harness.data.get('remy.inventory'), 'untouched-inventory');
  const restarted = preferenceHarness(harness.data.get('remy.preferences.language'));
  restarted.render(); restarted.mount(); await tick();
  assert.equal(restarted.render().language, 'en');
});
test('failed preference hydration blocks writes and supports retry', async () => {
  const harness = preferenceHarness('ar', true);
  harness.render(); harness.mount(); await tick();
  assert.equal(harness.render().ready, false);
  await harness.render().setLanguage('en');
  assert.equal(harness.data.get('remy.preferences.language'), 'ar');
  harness.setFailRead(false);
  await harness.render().retry();
  assert.equal(harness.render().language, 'ar');
  assert.equal(harness.render().ready, true);
});

test('app/menu catalogs cover all existing feature destinations in both languages',()=>{
 const {appMessages,featureMessages,menuGroupLabels}=require('../src/i18n/app.ts');const {menuItems,featureGroups}=require('../src/data/feature-menu.ts');
 assert.deepEqual(Object.keys(appMessages.en).sort(),Object.keys(appMessages.ar).sort());assert.deepEqual(Object.keys(featureMessages.en).sort(),Object.keys(featureMessages.ar).sort());assert.deepEqual(Object.keys(menuGroupLabels.en).sort(),Object.keys(menuGroupLabels.ar).sort());
 for(const item of menuItems){assert.ok(featureMessages.en[item.id].title);assert.match(featureMessages.ar[item.id].title,/[\u0600-\u06ff]/u);assert.match(featureMessages.ar[item.id].description,/[\u0600-\u06ff]/u);}for(const group of featureGroups)assert.ok(menuGroupLabels.ar[group.title]);
});
test('Settings selector persists English-Arabic-English and updates More, feature notices, Health and tabs without restart',async()=>{
 const {appMessages,featureMessages,menuGroupLabels}=require('../src/i18n/app.ts');const {menuItems,featureGroups}=require('../src/data/feature-menu.ts');const {homeMessages}=require('../src/i18n/home.ts');
 const preference=preferenceHarness('en');preference.render();preference.mount();await tick();let feature='settings';
 const core=Object.fromEntries(['AppText','Button','Chip','Card','PageHeader','SectionHeader','Screen','ActionRow','Badge'].map(name=>[name,name]));core.uiStyles={wrap:{},stack:{}};
 const mocks={'react':{...require('react'),useState:()=>[false,()=>{}]},'react-native':{View:'View',Pressable:'Pressable',StyleSheet:{create:value=>value}},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-router':{router:{},useLocalSearchParams:()=>({feature})},'expo-router/ui':Object.fromEntries(['Tabs','TabList','TabTrigger','TabSlot'].map(name=>[name,name])),
 '@/providers/language-provider':{useLanguage:()=>preference.render()},'@/theme/provider':{useRemyTheme:()=>({colors:{},appearance:'system',setAppearance(){}})},'@/theme/tokens':{spacing:{},radii:{},layout:{}},'@/components/ui/core':core,'./ui/core':core,'@/components/ui/icon':{Icon:'Icon'},'@/data/feature-menu':{menuItems,featureGroups},'@/i18n/app':{appMessages,featureMessages,menuGroupLabels},'@/i18n/inventory':{inventoryMessages},'@/i18n/home':{homeMessages}};
 function load(file){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(id=>mocks[id]??require(id),exports);return exports;}
 mocks['@/components/language-controls']=load('src/components/language-controls.tsx');mocks['@/components/foundation-screen']=load('src/components/foundation-screen.tsx');
 mocks['@/screens/shopping-screen']={__esModule:true,default:'ShoppingScreen'};
 mocks['@/screens/planner-screen']={__esModule:true,default:'PlannerScreen'};
 mocks['@/screens/recipes-screen']={__esModule:true,default:'RecipesScreen'};
 mocks['@/screens/profile-screen']={__esModule:true,default:'ProfileScreen'};
 mocks['@/components/backend-connection']={BackendConnection:'BackendConnection'};
 mocks['@/i18n/cooking']=require('../src/i18n/cooking.ts');mocks['@/components/appearance-controls']={AppearanceControls:'AppearanceControls'};
 const More=load('src/screens/more-screen.tsx').default,Preview=load('src/screens/feature-preview-screen.tsx').default,Health=load('src/app/(tabs)/health.tsx').default,Tabs=load('src/app/(tabs)/_layout.tsx').default;
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}
 for(const language of ['en','ar','en']){
  const controls=nodes(mocks['@/components/language-controls'].LanguageControls());controls.find(node=>node.type==='Chip'&&node.key===language).props.onPress();await tick();assert.equal(preference.data.get('remy.preferences.language'),language);assert.equal(preference.render().language,language);
  const t=appMessages[language],rtl=language==='ar';const more=nodes(More());assert.equal(more[0].props.rtl,rtl);assert.ok(more.some(node=>node.props?.title===t.more));assert.ok(more.some(node=>node.props?.title===featureMessages[language].settings.title));
  feature='settings';const settings=nodes(Preview());assert.equal(settings.find(node=>node.type==='Screen').props.rtl,rtl);assert.ok(settings.some(node=>node.props?.children===inventoryMessages[language].settings));assert.ok(settings.some(node=>node.props?.rtl===rtl&&node.props?.icon==='back'));
  for(feature of ['chat','community','contact']){const preview=nodes(Preview());assert.ok(preview.some(node=>node.props?.children===featureMessages[language][feature].title));assert.ok(preview.some(node=>node.props?.children===featureMessages[language][feature].description));}
  const health=Health();assert.equal(health.props.title,t.health);assert.equal(health.type(health.props).props.rtl,rtl);
  feature='shopping';assert.equal(Preview().type,'ShoppingScreen');feature='recipes';assert.equal(Preview().type,'RecipesScreen');
  feature='cooking';const cookingEntry=nodes(Preview());assert.ok(cookingEntry.some(node=>node.props?.label===mocks['@/i18n/cooking'].cookingMessages[language].choose));assert.ok(!cookingEntry.some(node=>node.type==='Badge'));assert.equal(cookingEntry.find(node=>node.type==='Screen').props.rtl,rtl);
  const tabs=nodes(Tabs());const tabList=tabs.find(node=>node.type==='TabList');assert.equal(tabList.props.style[1].direction,'ltr');assert.equal(tabList.props.style[0].flexDirection,'row');
  const triggers=tabs.filter(node=>node.type==='TabTrigger');assert.deepEqual(triggers.map(node=>[node.props.name,node.props.href]),[['home','/'],['kitchen','/kitchen'],['add','/add'],['health','/health'],['more','/more']]);
  for(const trigger of triggers){let pressed=false;const child=trigger.props.children;const rendered=child.type({...child.props,onPress:()=>pressed=true});if(trigger.props.name==='add'){mocks['expo-router'].router.push=path=>{assert.equal(path,'/food-entry');pressed=true;};}rendered.props.onPress();assert.equal(pressed,true);}
const tabLabels=tabs.filter(node=>typeof node.type==='function').map(node=>node.props.children);assert.deepEqual(tabLabels,[t.home,t.kitchen,t.add,t.health,t.more]);
 }
 assert.equal(preference.data.get('remy.inventory'),'untouched-inventory');
});
