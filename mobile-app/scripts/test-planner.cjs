const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { PlannerStore, PLANNER_KEY } = require('../src/repositories/planner-store.ts');
const { weekDates, shiftDate, validMeal } = require('../src/domain/planner.ts');
const { plannerMessages } = require('../src/i18n/planner.ts');
function storage() {
  const data = new Map([['remy.inventory', 'preserved inventory']]);
  return { data, writes: 0, fail: false, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { if (this.fail) throw new Error('write rejected'); this.writes++; data.set(key, value); } };
}
test('planner creation, day/period assignment, restart, removal and subscription preserve inventory', async () => {
  const memory = storage(); const store = new PlannerStore(memory);
  await assert.rejects(store.add('2026-10-14', 'lunch', 'bowl')); await store.hydrate();
  assert.equal(memory.writes, 0); assert.deepEqual(store.getSnapshot().meals, []);
  let updates = 0; store.subscribe(() => updates++);
  await Promise.all([store.add('2026-10-14', 'lunch', 'bowl'), store.add('2026-10-20', 'snack', 'breakfast')]);
  assert.equal(store.getSnapshot().meals.length, 2); assert.ok(updates > 0);
  const restart = new PlannerStore(memory); await restart.hydrate(); assert.deepEqual(restart.getSnapshot().meals, store.getSnapshot().meals);
  assert.equal(restart.getSnapshot().meals[1].date, '2026-10-20'); assert.equal(restart.getSnapshot().meals[1].period, 'snack');
  await restart.remove(restart.getSnapshot().meals[0].id); const again = new PlannerStore(memory); await again.hydrate(); assert.equal(again.getSnapshot().meals.length, 1);
  assert.equal(memory.data.get('remy.inventory'), 'preserved inventory');
});
test('planner failures retain plans and corrupt storage blocks writes without a reset', async () => {
  const memory = storage(); const store = new PlannerStore(memory); await store.hydrate(); await store.add('2026-10-14', 'breakfast', 'breakfast');
  const raw = memory.data.get(PLANNER_KEY); memory.fail = true; await assert.rejects(store.remove(store.getSnapshot().meals[0].id)); await assert.rejects(store.add('2026-10-15', 'dinner', 'bowl')); assert.equal(memory.data.get(PLANNER_KEY), raw); assert.equal(store.getSnapshot().meals.length, 1);
  memory.fail = false; await store.remove(store.getSnapshot().meals[0].id);
  for (const invalid of ['invalid JSON', '{"version":2,"meals":[]}', '{"version":1,"meals":[{}]}']) {
    memory.data.set(PLANNER_KEY, invalid); const broken = new PlannerStore(memory); await broken.hydrate(); assert.equal(broken.getSnapshot().status, 'error'); await assert.rejects(broken.add('2026-10-14', 'lunch', 'bowl')); assert.equal(memory.data.get(PLANNER_KEY), invalid);
    memory.data.set(PLANNER_KEY, raw); await broken.hydrate(); assert.equal(broken.getSnapshot().status, 'ready');
  }
});
test('weekly calendar keeps local date keys across month/year/leap boundaries and locales have parity', () => {
  assert.deepEqual(weekDates('2026-10-18'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01'); assert.equal(shiftDate('2024-02-28', 1), '2024-02-29'); assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(weekDates(shiftDate('2026-10-18', 7))[0], '2026-10-19'); assert.deepEqual(Object.keys(plannerMessages.en).sort(), Object.keys(plannerMessages.ar).sort());
  assert.equal(validMeal({ id: 'meal', date: '2026-02-30', period: 'lunch', recipeId: 'bowl' }), false);
  assert.equal(validMeal({ id: 'meal', date: '2026-10-14', period: 'unknown', recipeId: 'bowl' }), false);
  // Unknown references remain readable; UI supplies an unavailable state rather than destroying saved plans.
  assert.equal(validMeal({ id: 'meal', date: '2026-10-14', period: 'lunch', recipeId: 'removed_recipe' }), true);
});

test('planner UI adds and removes meals, retains failed drafts and handles missing recipes in English/Arabic',async()=>{
 const {demoRecipes}=require('../src/data/kitchen-demo.ts');const content=require('../src/data/home-content.ts');const memory=storage(),store=new PlannerStore(memory);await store.hydrate();let language='en',states=[],refs=[],cursor=0,refCursor=0;
 const core=Object.fromEntries(['AppText','Button','Card','Chip','EmptyState','PageHeader','Screen','SectionHeader'].map(name=>[name,name]));core.uiStyles={wrap:{}};
 const mocks={react:{useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],next=>states[index]=typeof next==='function'?next(states[index]):next];},useRef:initial=>refs[refCursor++]??(refs[refCursor-1]={current:initial})},'expo-router':{router:{}},'react-native':{Keyboard:{dismiss(){}},Platform:{OS:'web'},KeyboardAvoidingView:'KeyboardAvoidingView',Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/ui/core':core,'@/components/ui/icon':{Icon:'Icon'},'@/utils/planner-layout':{...require('../src/utils/planner-layout.ts')},'@/components/ui/form-field':{FormField:'FormField'},'@/components/food-image':{FoodImage:'FoodImage'},'@/data/kitchen-demo':{demoRecipes},'@/data/home-content':content,'@/domain/inventory':require('../src/domain/inventory.ts'),'@/domain/planner':require('../src/domain/planner.ts'),'@/i18n/planner':{plannerMessages},'@/providers/planner-provider':{usePlanner:()=>({...store.getSnapshot(),add:store.add,remove:store.remove,retry:store.hydrate})},'@/providers/language-provider':{useLanguage:()=>({language})},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/theme/tokens':{spacing:{xs:4,sm:8,md:12,lg:16},radii:{}}};
 const exports={};const code=ts.transpileModule(fs.readFileSync('src/screens/planner-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(id=>mocks[id]??require(id),exports);
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}const render=()=>{cursor=refCursor=0;return nodes(exports.default());};const tick=()=>new Promise(resolve=>setImmediate(resolve));
 let tree=render();assert.ok(tree.some(node=>node.props?.children===plannerMessages.en.empty));assert.equal(tree.filter(node=>node.type==='Button'&&node.props.label===plannerMessages.en.add).length,1);tree.find(node=>node.type==='Button'&&node.props.label===plannerMessages.en.add).props.onPress();tree=render();assert.equal(tree.find(node=>node.type==='Modal').props.visible,true);
 tree.find(node=>node.type==='FormField').props.onChangeText('2026-12-31');tree.find(node=>node.type==='Chip'&&node.props.label===plannerMessages.en.lunch).props.onPress();tree.find(node=>node.type==='Pressable'&&node.props.accessibilityLabel===content.recipeTitle('bowl','en')).props.onPress();tree=render();const calendar=tree.find(node=>node.props?.accessibilityLabel===plannerMessages.en.calendar);assert.equal(calendar.props.style.direction,'ltr');
 const save=tree.find(node=>node.type==='Button'&&node.props.label===plannerMessages.en.save);save.props.onPress();save.props.onPress();await tick();tree=render();assert.equal(store.getSnapshot().meals.length,1);assert.equal(store.getSnapshot().meals[0].date,'2026-12-31');assert.equal(store.getSnapshot().meals[0].period,'lunch');assert.ok(tree.some(node=>node.props?.children===plannerMessages.en.added));
 tree.find(node=>node.type==='Pressable'&&node.props.accessibilityLabel===plannerMessages.en.nextMonth).props.onPress();tree=render();assert.equal(store.getSnapshot().meals.length,1);tree.find(node=>node.type==='Pressable'&&node.props.accessibilityLabel===plannerMessages.en.previousMonth).props.onPress();
 await store.add('2026-12-31','dinner','missing_recipe');language='ar';tree=render();assert.equal(tree.find(node=>node.type==='Screen').props.rtl,true);assert.equal(tree.find(node=>node.props?.accessibilityLabel===plannerMessages.ar.calendar).props.style.direction,'rtl');const missing=tree.find(node=>node.type==='Pressable'&&node.props.accessibilityLabel.endsWith(plannerMessages.ar.missing));missing.props.onPress();tree=render();assert.ok(tree.some(node=>node.props?.children===plannerMessages.ar.missingBody));memory.fail=true;tree.find(node=>node.type==='Button'&&node.props.label===plannerMessages.ar.remove).props.onPress();await tick();tree=render();assert.equal(store.getSnapshot().meals.length,2);assert.equal(tree.find(node=>node.type==='Modal').props.visible,true);assert.ok(tree.some(node=>node.props?.children===plannerMessages.ar.writeError));memory.fail=false;tree.find(node=>node.type==='Button'&&node.props.label===plannerMessages.ar.remove).props.onPress();await tick();assert.equal(store.getSnapshot().meals.length,1);assert.ok(render().some(node=>node.props?.children===plannerMessages.ar.removed));
 const beforeSelection=memory.data.get(PLANNER_KEY);tree=render();tree.find(node=>node.type==='View'&&node.key==='2026-11-28').props.children.props.onPress();tree=render();assert.ok(tree.some(node=>node.type==='View'&&node.key==='2026-12-01'));tree.find(node=>node.type==='View'&&node.key==='2026-12-01').props.children.props.onPress();tree=render();assert.equal(memory.data.get(PLANNER_KEY),beforeSelection);assert.equal(tree.filter(node=>node.type==='Pressable'&&node.props.accessibilityState?.selected&&node.props.accessibilityLabel!==content.recipeTitle('bowl','ar')).length,1);
 assert.equal(memory.data.get('remy.inventory'),'preserved inventory');
});


test('monthly grids have correct leap lengths, alignment and adjacent dates in both locale orders',()=>{
 const {monthGrid,shiftMonth,calendarFirstWeekday,calendarWeekdays}=require('../src/utils/planner-layout.ts');
 for(const language of ['en','ar'])for(const [date,length] of [['2024-02-01',29],['2026-02-01',28],['2026-04-01',30],['2026-01-01',31]]){const rows=monthGrid(date,language);assert.ok(rows.length>=4&&rows.length<=6);assert.ok(rows.every(row=>row.length===7));assert.equal(rows.flat().filter(cell=>cell.inMonth).length,length);assert.equal(new Date(rows[0][0].date+'T12:00:00').getDay(),calendarFirstWeekday(language));}
 assert.equal(shiftMonth('2026-12-31',1),'2027-01-01');assert.equal(shiftMonth('2027-01-31',-1),'2026-12-01');assert.equal(shiftMonth('2024-01-31',1),'2024-02-01');
 const grid=monthGrid('2026-10-01','en').flat();assert.equal(grid[0].date,'2026-09-27');assert.equal(grid.at(-1).date,'2026-10-31');const trailing=monthGrid('2026-04-01','en').flat();assert.ok(trailing.some(cell=>cell.date==='2026-05-01'&&!cell.inMonth));
 assert.equal(calendarWeekdays('en')[0].full,'Sunday');assert.equal(calendarWeekdays('ar')[0].full,'\u0627\u0644\u0633\u0628\u062a');
});
