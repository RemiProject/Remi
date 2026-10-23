const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const utils=require('../src/utils/cooking-session.ts');
const {cookingSessions}=require('../src/services/cooking-sessions.ts');
const {cookingMessages}=require('../src/i18n/cooking.ts');
test('navigation and completion are bounded, preserve progress, and complete once',()=>{
 let s=utils.initialCookingSession;s=utils.advanceCooking(s,4);assert.equal(s.current,1);assert.deepEqual(s.completed,[0]);
 s=utils.selectCookingStep(s,0,4);assert.deepEqual(s.completed,[0]);s=utils.advanceCooking(s,4);assert.deepEqual(s.completed,[0]);
 s=utils.advanceCooking(s,4);s=utils.advanceCooking(s,4);s=utils.advanceCooking(s,4);assert.equal(s.finished,true);assert.equal(s.completed.length,4);
 assert.equal(utils.advanceCooking(s,4),s);assert.equal(utils.selectCookingStep(s,0,4),s);
 assert.equal(utils.selectCookingStep(utils.initialCookingSession,-1,4),utils.initialCookingSession);
 assert.equal(utils.advanceCooking(utils.initialCookingSession,0),utils.initialCookingSession);
});
test('missing instructions are rejected and translations have parity',()=>{
 for(const value of [undefined,[],[''],['valid',null]])assert.deepEqual(utils.cookingInstructions({x:value},'x'),[]);
 assert.deepEqual(Object.keys(cookingMessages.en),Object.keys(cookingMessages.ar));
 for(const key of Object.keys(cookingMessages.en))assert.match(cookingMessages.ar[key],/[\u0600-\u06ff]/u);
});
test('mounted-flow sessions resume, publish changes, isolate recipes and ignore duplicate completion',()=>{
 let count=0;const off=cookingSessions.subscribe(()=>count++);
 cookingSessions.update('test',s=>utils.advanceCooking(s,1));const s=cookingSessions.get('test');
 cookingSessions.update('test',s=>utils.advanceCooking(s,1));assert.equal(count,1);assert.equal(cookingSessions.get('test'),s);
 assert.equal(cookingSessions.get('another'),utils.initialCookingSession);off();
});
test('actual screen navigates steps, switches languages, resumes and handles absent data without timers',()=>{
 let language='en',id='breakfast';const routes=[];
 const {demoRecipes}=require('../src/data/kitchen-demo.ts');const {sampleSteps}=require('../src/i18n/recipes.ts');const content=require('../src/data/home-content.ts');
 const element=(type,props)=>({type,props});
 const mocks={react:{useSyncExternalStore:(_subscribe,get)=>get()},'react/jsx-runtime':{jsx:element,jsxs:element},'expo-router':{router:{replace:r=>routes.push(r),back:()=>routes.push('back'),canGoBack:()=>true},useLocalSearchParams:()=>({id})},'react-native':{View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/ui/core':Object.fromEntries(['AppText','Button','Card','Chip','EmptyState','PageHeader','Screen','SectionHeader'].map(k=>[k,k])),'@/data/kitchen-demo':{demoRecipes},'@/data/home-content':content,'@/i18n/recipes':{sampleSteps},'@/i18n/cooking':{cookingMessages},'@/providers/language-provider':{useLanguage:()=>({language})},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/services/cooking-sessions':{cookingSessions},'@/utils/cooking-session':utils,'@/theme/tokens':{spacing:{},radii:{}}};
 const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/screens/cooking-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(k=>{assert.ok(mocks[k],k);return mocks[k];},exports);
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];const render=()=>nodes(exports.default());
 const press=key=>render().find(n=>n.props?.label===cookingMessages[language][key]).props.onPress();
 const oldMinutes=demoRecipes[1].minutes;demoRecipes[1].minutes=undefined;assert.ok(render().some(n=>n.type==='Screen'));demoRecipes[1].minutes=oldMinutes;
 assert.equal(render().find(n=>n.props?.label===cookingMessages.en.previous).props.disabled,true);press('next');
 assert.equal(render().find(n=>n.props?.accessibilityRole==='progressbar').props.accessibilityValue.now,1);
 press('previous');assert.equal(cookingSessions.get(id).current,0);press('next');
 language='ar';assert.equal(render().find(n=>n.type==='Screen').props.rtl,true);assert.ok(render().some(n=>n.props?.children===sampleSteps.ar.breakfast[1]));
 render().find(n=>n.type==='PageHeader').props.action.props.onPress();assert.deepEqual(routes,['back']);assert.equal(cookingSessions.get(id).current,1);
 press('next');press('next');const finish=render().find(n=>n.props?.label===cookingMessages.ar.finish).props.onPress;finish();finish();
 assert.ok(render().some(n=>n.props?.title===cookingMessages.ar.done));
 id='invalid';assert.ok(render().some(n=>n.type==='EmptyState'));
 // Existing recipes have no step-duration data; no timer controls or interval are invented.
 assert.doesNotMatch(fs.readFileSync('src/screens/cooking-screen.tsx','utf8'),/setInterval|setTimeout|timerDuration|createItem|updateItem/);
 const old=sampleSteps.ar.bowl;sampleSteps.ar.bowl=undefined;id='bowl';assert.ok(render().some(n=>n.type==='EmptyState'));sampleSteps.ar.bowl=old;
});
