const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
};
const { searchHome } = require('../src/data/home-content.ts');
const { homeMessages } = require('../src/i18n/home.ts');
const item = { id: 'user-rice', name: 'My rice', categoryId: 'grains', storageId: 'pantry', quantity: 1, unitId: 'kg', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' };
const { discoverRecipes, ingredientMatches } = require('../src/utils/recipe-view.ts');
const { recipeMessages, sampleSteps } = require('../src/i18n/recipes.ts');
test('recipe discovery combines bilingual name/ingredient search with supported time filters', () => {
  assert.equal(discoverRecipes('', 'en', null).length, 2);
  assert.deepEqual(discoverRecipes('', 'ar', 10).map((recipe) => recipe.id), ['breakfast']);
  assert.deepEqual(discoverRecipes(' spinach ', 'en', 20).map((recipe) => recipe.id), ['bowl']);
  assert.equal(discoverRecipes('سبانخ', 'ar', 10).length, 0);
  assert.deepEqual(discoverRecipes('توت', 'ar', null).map((recipe) => recipe.id), ['breakfast']);
  assert.equal(discoverRecipes('unknown', 'en', null).length, 0);
  assert.deepEqual(Object.keys(recipeMessages.en).sort(), Object.keys(recipeMessages.ar).sort());
  for (const id of ['bowl', 'breakfast']) assert.equal(sampleSteps.en[id].length, sampleSteps.ar[id].length);
});
test('recipe ingredient name matches only actual inventory, never sample fixtures or partial names', () => {
  const saved = [{ ...item, name: ' Brown   rice ' }, { ...item, id: 'arabic', name: 'سبانخ' }, { ...item, id: 'not-rice', name: 'Rice pudding' }];
  const before = JSON.stringify(saved);
  assert.equal(ingredientMatches('rice', saved)[0], saved[0]);
  assert.deepEqual(ingredientMatches('spinach', saved).map((food) => food.id), ['arabic']);
  assert.deepEqual(ingredientMatches('yogurt', saved), []);
  assert.deepEqual(ingredientMatches('rice', []), []);
  assert.equal(JSON.stringify(saved), before);
});
test('Home search normalizes whitespace/case and preserves food identity', () => {
  assert.equal(searchHome([item], ' RICE ', 'en', 'all').foods[0], item);
  assert.equal(searchHome([item], 'rice', 'en', 'all').recipes[0].id, 'bowl');
});
test('scopes separate actual inventory from sample recipes', () => {
  assert.equal(searchHome([], '', 'en', 'all').foods.length, 0);
  assert.equal(searchHome([item], '', 'en', 'recipes').foods.length, 0);
  assert.equal(searchHome([item], '', 'en', 'foods').recipes.length, 0);
  assert.deepEqual(searchHome([item], 'missing', 'en', 'all'), { foods: [], recipes: [] });
});
test('Arabic search matches translated recipe titles and ingredients', () => {
  assert.equal(searchHome([], 'سبانخ', 'ar', 'recipes').recipes[0].id, 'bowl');
  assert.equal(searchHome([], 'شوفان', 'ar', 'recipes').recipes[0].id, 'breakfast');
  assert.deepEqual(Object.keys(homeMessages.en).sort(), Object.keys(homeMessages.ar).sort());
});
test('image fallback remains visible before loading and after failure; changed source resets state', () => {
  const source = ts.transpileModule(fs.readFileSync('src/components/food-image.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exported = {};
  let states = [false, false];
  let cursor = 0;
  new Function('require', 'exports', source)((id) => {
    if (id === 'react') return { useState: () => { const slot = cursor++; return [states[slot], (value) => { states[slot] = value; }]; } };
    if (id === 'react-native') return { View: 'View' };
    if (id === 'expo-image') return { Image: 'Image' };
    if (id === './ui/icon') return { Icon: 'Icon' };
    if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: {} }) };
    return require(id);
  }, exported);
  const wrapper = exported.FoodImage({ uri: 'test-photo', label: 'photo' });
  const render = () => { cursor = 0; return wrapper.type(wrapper.props); };
  const initial = render();
  assert.equal(initial.props.children[0].type, 'Icon');
  assert.equal(initial.props.children[1].props.style.opacity, 0);
  initial.props.children[1].props.onLoad();
  assert.equal(render().props.children[1].props.style.opacity, 1);
  initial.props.children[1].props.onError();
  assert.equal(render().props.children[1], false);
  assert.notEqual(exported.FoodImage({ uri: 'new-photo', label: 'photo' }).key, wrapper.key);
});

test('recipe details keep step completion across language updates and gate inventory matches on ready state',()=>{
 const {demoRecipes}=require('../src/data/kitchen-demo.ts');const content=require('../src/data/home-content.ts');const {homeUnitLabels}=require('../src/i18n/home.ts');let language='en',id='bowl',completed;let status='ready';const pushed=[];
 const core=Object.fromEntries(['AppText','Button','Card','Chip','EmptyState','PageHeader','Screen','SectionHeader'].map(name=>[name,name]));
 const mocks={react:{useState:initial=>{if(completed===undefined)completed=initial();return [completed,next=>completed=next(completed)];}},'expo-router':{router:{push:route=>pushed.push(route),canGoBack:()=>false,replace:route=>pushed.push(route)},useLocalSearchParams:()=>({id})},'react-native':{View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/ui/core':core,'@/components/food-image':{FoodImage:'FoodImage'},'@/data/kitchen-demo':{demoRecipes},'@/data/home-content':content,'@/i18n/home':{homeMessages,homeUnitLabels},'@/i18n/recipes':{recipeMessages,sampleSteps},'@/providers/inventory-provider':{useInventory:()=>({items:[{...item,name:'Brown rice'}],status,retryRead:async()=>{}})},'@/providers/language-provider':{useLanguage:()=>({language})},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/utils/recipe-view':{ingredientMatches},'@/theme/tokens':{spacing:{}}};
 mocks['@/i18n/cooking']=require('../src/i18n/cooking.ts');mocks['@/utils/cooking-session']=require('../src/utils/cooking-session.ts');
 const exported={};const code=ts.transpileModule(fs.readFileSync('src/screens/recipe-detail-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(name=>mocks[name]??require(name),exported);
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}
 const render=()=>{const root=exported.default();return nodes(root.type(root.props));};let tree=render();assert.equal(tree.find(node=>node.type==='Screen').props.rtl,false);let steps=tree.filter(node=>node.type==='Chip');assert.equal(steps.length,4);steps[0].props.onPress();tree=render();assert.equal(tree.filter(node=>node.type==='Chip')[0].props.selected,true);
 tree.find(node=>node.props?.label===mocks['@/i18n/cooking'].cookingMessages.en.start).props.onPress();assert.deepEqual(pushed.at(-1),{pathname:'/cooking/[id]',params:{id:'bowl'}});
 language='ar';tree=render();assert.equal(tree.find(node=>node.type==='Screen').props.rtl,true);steps=tree.filter(node=>node.type==='Chip');assert.equal(steps[0].props.label,recipeMessages.ar.undo);steps[0].props.onPress();assert.equal(render().filter(node=>node.type==='Chip')[0].props.selected,false);
 const food=tree.find(node=>node.type==='Button'&&node.props.label.startsWith('Brown rice'));food.props.onPress();assert.deepEqual(pushed.at(-1),{pathname:'/food/[id]',params:{id:item.id}});
 status='loading';tree=render();assert.ok(tree.some(node=>node.props?.children===recipeMessages.ar.loading));assert.ok(!tree.some(node=>node.props?.children===recipeMessages.ar.notMatched));
 status='error';tree=render();assert.ok(tree.some(node=>node.props?.label===recipeMessages.ar.retry));id='unknown';tree=render();assert.ok(tree.some(node=>node.type==='EmptyState'&&node.props.title===recipeMessages.ar.missing));
});
