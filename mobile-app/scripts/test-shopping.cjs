const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { ShoppingStore, SHOPPING_KEY } = require('../src/repositories/shopping-store.ts');
const { validateShopping, shoppingView, validShoppingItem } = require('../src/domain/shopping.ts');
const { shoppingMessages } = require('../src/i18n/shopping.ts');
function storage() { const data = new Map([['remy.inventory', 'inventory'], ['remy.meal-planner', 'plans']]); return { data, writes: 0, fail: false, readFail: false, async getItem(key) { if (this.readFail) throw new Error('read'); return data.get(key) ?? null; }, async setItem(key, value) { if (this.fail) throw new Error('write'); this.writes++; data.set(key, value); } }; }
test('shopping create/edit/toggle/reload/delete/clear retain identity and other stores', async () => {
  const memory = storage(), store = new ShoppingStore(memory); await assert.rejects(store.save({ name: 'Milk' })); await store.hydrate(); assert.equal(memory.writes, 0);
  await Promise.all([store.save({ name: 'Milk', quantity: 2, unit: 'L', category: 'dairy' }), store.save({ name: 'Bread' })]);
  const item = store.getSnapshot().items[0]; await store.toggle(item.id); await store.save({ name: 'Whole milk', quantity: 1 }, item.id);
  const edited = store.getSnapshot().items[0]; assert.equal(edited.id, item.id); assert.equal(edited.createdAt, item.createdAt); assert.equal(edited.purchased, true); assert.equal(edited.unit, undefined); assert.ok(edited.updatedAt >= item.updatedAt);
  const restarted = new ShoppingStore(memory); await restarted.hydrate(); assert.deepEqual(restarted.getSnapshot().items, store.getSnapshot().items);
  await restarted.toggle(item.id); assert.equal(restarted.getSnapshot().items[0].purchased, false); await restarted.toggle(item.id); await restarted.clearPurchased(); assert.equal(restarted.getSnapshot().items.length, 1); await restarted.remove(restarted.getSnapshot().items[0].id); assert.deepEqual(restarted.getSnapshot().items, []);
  assert.equal(memory.data.get('remy.inventory'), 'inventory'); assert.equal(memory.data.get('remy.meal-planner'), 'plans');
});
test('shopping validates optional quantities/units, catalog parity and search/filter combinations', async () => {
  const draft = { name: ' Milk ', quantity: '', unit: '', category: '' };
  assert.deepEqual(validateShopping(draft).value, { name: 'Milk' });
  for (const quantity of ['0', '-1', 'Infinity', '1x', '0x10', '١', '1,5']) assert.ok(validateShopping({ ...draft, quantity }).errors.quantity);
  assert.equal(validateShopping({ ...draft, quantity: '0.5', unit: ' kg ' }).value.unit, 'kg');
  assert.ok(validateShopping({ ...draft, unit: 'x'.repeat(25) }).errors.unit); assert.ok(validateShopping({ ...draft, name: ' ' }).errors.name); assert.ok(validateShopping({ ...draft, category: 'unsupported' }).errors.category);
  const memory = storage(), store = new ShoppingStore(memory); await store.hydrate(); await store.save({ name: 'Milk' }); await store.save({ name: 'Bread' }); await store.toggle(store.getSnapshot().items[0].id);
  assert.equal(shoppingView(store.getSnapshot().items, ' MILK ', 'purchased').length, 1); assert.equal(shoppingView(store.getSnapshot().items, 'milk', 'toBuy').length, 0); assert.equal(shoppingView(store.getSnapshot().items, '', 'all').length, 2);
  assert.deepEqual(Object.keys(shoppingMessages.en).sort(), Object.keys(shoppingMessages.ar).sort()); for (const text of Object.values(shoppingMessages.ar)) assert.match(text, /[\u0600-\u06ff]/u);
});
test('failed shopping writes and corrupt reads never replace saved data; queue/retry recover', async () => {
  const memory = storage(), store = new ShoppingStore(memory); await store.hydrate(); await store.save({ name: 'Rice' }); const item = store.getSnapshot().items[0], raw = memory.data.get(SHOPPING_KEY); memory.fail = true;
  for (const operation of [() => store.save({ name: 'Changed' }, item.id), () => store.toggle(item.id), () => store.remove(item.id), () => store.clearPurchased()]) await assert.rejects(operation());
  assert.equal(memory.data.get(SHOPPING_KEY), raw); assert.deepEqual(store.getSnapshot().items, [item]); memory.fail = false; await store.toggle(item.id);
  for (const invalid of ['bad JSON', '{"version":2,"items":[]}', JSON.stringify({ version: 1, items: [item, item] }), JSON.stringify({ version: 1, items: [{ ...item, quantity: -1 }] })]) {
    memory.data.set(SHOPPING_KEY, invalid); const broken = new ShoppingStore(memory); await broken.hydrate(); assert.equal(broken.getSnapshot().status, 'error'); await assert.rejects(broken.save({ name: 'New' })); assert.equal(memory.data.get(SHOPPING_KEY), invalid); memory.data.set(SHOPPING_KEY, raw); await broken.hydrate(); assert.equal(broken.getSnapshot().status, 'ready');
  }
  memory.readFail = true; const denied = new ShoppingStore(memory); await denied.hydrate(); assert.equal(denied.getSnapshot().status, 'error'); memory.readFail = false; await denied.hydrate(); assert.equal(denied.getSnapshot().status, 'ready'); assert.equal(validShoppingItem({ ...item, unit: {} }), false);
});

test('shopping UI validates, saves, checks purchase status and requires explicit clear confirmation in both languages',async()=>{
 const memory=storage(),store=new ShoppingStore(memory);await store.hydrate();let language='en',state=[],refs=[],cursor=0,refCursor=0;
 const core=Object.fromEntries(['AppText','Button','Card','Chip','EmptyState','PageHeader','Screen','SearchField','SectionHeader'].map(name=>[name,name]));core.uiStyles={row:{},wrap:{}};
 const mocks={react:{useState:initial=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],next=>state[index]=typeof next==='function'?next(state[index]):next];},useRef:initial=>refs[refCursor++]??(refs[refCursor-1]={current:initial})},'expo-router':{router:{}},'react-native':{Keyboard:{dismiss(){}},KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'web'},Modal:'Modal',Pressable:'Pressable',View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/ui/core':core,'@/components/ui/form-field':{FormField:'FormField'},'@/components/ui/icon':{Icon:'Icon'},'@/domain/shopping':require('../src/domain/shopping.ts'),'@/i18n/shopping':{shoppingMessages},'@/providers/shopping-provider':{useShopping:()=>({...store.getSnapshot(),retry:store.hydrate,save:store.save,toggle:store.toggle,remove:store.remove,clearPurchased:store.clearPurchased})},'@/providers/language-provider':{useLanguage:()=>({language})},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/theme/tokens':{spacing:{},radii:{}}};
 const exports={};const compiled=ts.transpileModule(fs.readFileSync('src/screens/shopping-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',compiled)(id=>mocks[id]??require(id),exports);
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];if(typeof tree.type==='function')return nodes(tree.type(tree.props));return [tree,...nodes(tree.props?.children)];}const render=()=>{cursor=refCursor=0;return nodes(exports.default());},tick=()=>new Promise(resolve=>setImmediate(resolve));
 let tree=render();assert.ok(tree.some(node=>node.type==='EmptyState'));tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.en.add).props.onPress();tree=render();tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.en.save).props.onPress();tree=render();assert.equal(tree.find(node=>node.type==='FormField'&&node.props.label===shoppingMessages.en.name).props.error,shoppingMessages.en.nameError);
 tree.find(node=>node.type==='FormField'&&node.props.label===shoppingMessages.en.name).props.onChangeText('Apples');tree=render();const save=tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.en.save);save.props.onPress();save.props.onPress();await tick();tree=render();assert.equal(store.getSnapshot().items.length,1);assert.equal(tree.find(node=>node.type==='Modal').props.visible,false);
 tree.find(node=>node.type==='Pressable'&&node.props.accessibilityRole==='checkbox').props.onPress();await tick();tree=render();assert.equal(tree.find(node=>node.type==='Pressable'&&node.props.accessibilityRole==='checkbox').props.accessibilityState.checked,true);
 language='ar';tree=render();assert.equal(tree.find(node=>node.type==='Screen').props.rtl,true);tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.ar.clear).props.onPress();assert.equal(store.getSnapshot().items.length,1);tree=render();assert.equal(tree.find(node=>node.type==='Modal').props.visible,true);memory.fail=true;tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.ar.confirm).props.onPress();await tick();tree=render();assert.equal(store.getSnapshot().items.length,1);assert.ok(tree.some(node=>node.props?.children===shoppingMessages.ar.writeError));assert.equal(tree.find(node=>node.type==='Modal').props.visible,true);memory.fail=false;tree.find(node=>node.type==='Button'&&node.props.label===shoppingMessages.ar.confirm).props.onPress();await tick();assert.deepEqual(store.getSnapshot().items,[]);assert.equal(render().find(node=>node.type==='Modal').props.visible,false);
});
