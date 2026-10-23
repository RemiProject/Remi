const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({saved=null,failRead=false,failWrite=false,deferred=false}={}) {
 const data=new Map([['remy.preferences.appearance',saved],['remy.inventory','untouched']]);
 let system='light',cursor=0,effect,release;const slots=[];
 const react={createContext:()=>({Provider:'Provider'}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=value];},useRef:initial=>{const i=cursor++;return slots[i]??={current:initial};},useEffect:fn=>{effect??=fn;}};
 const storage={getItem:async key=>{const old=data.get(key);if(deferred)await new Promise(r=>release=r);if(failRead)throw Error('read');return old;},setItem:async(key,value)=>{if(failWrite)throw Error('write');data.set(key,value);}};
 const mocks={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props})},'@react-native-async-storage/async-storage':{__esModule:true,default:storage},'@/hooks/use-color-scheme':{useColorScheme:()=>system},'./tokens':{themes:{light:{background:'light'},dark:{background:'dark'}}}};
 const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/theme/provider.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{assert.ok(mocks[id],id);return mocks[id];},exports);
 const render=()=>{cursor=0;return exports.RemyThemeProvider({children:'app'});};
 return{render,mount:()=>effect(),data,release:()=>release(),system:value=>system=value,failWrite:value=>failWrite=value};
}
for(const preference of ['light','dark','system'])test(`saves and restores ${preference} using dedicated key`,async()=>{
 const h=harness();assert.equal(h.render().props.children,null);h.mount();await flush();
 h.render().props.value.setAppearance(preference);assert.equal(h.render().props.value.appearance,preference);assert.equal(h.render().props.value.saving,true);
 await flush();assert.equal(h.data.get('remy.preferences.appearance'),preference);assert.equal(h.data.get('remy.inventory'),'untouched');
 const restart=harness({saved:h.data.get('remy.preferences.appearance')});restart.render();restart.mount();await flush();assert.equal(restart.render().props.value.appearance,preference);assert.equal(restart.render().props.children,'app');
});
for(const saved of [null,'invalid','"dark"'])test(`missing/invalid preference ${saved} defaults to system without a hydration write`,async()=>{
 const h=harness({saved});h.render();h.mount();await flush();assert.equal(h.render().props.value.appearance,'system');assert.equal(h.data.get('remy.preferences.appearance'),saved);
});
test('read failure defaults safely and explicit selection recovers',async()=>{
 const h=harness({failRead:true});h.render();h.mount();await flush();assert.equal(h.render().props.children,'app');assert.equal(h.render().props.value.error,'read');assert.equal(h.render().props.value.appearance,'system');
 h.render().props.value.setAppearance('dark');await flush();assert.equal(h.render().props.value.error,null);assert.equal(h.data.get('remy.preferences.appearance'),'dark');
});
test('failed writes retain immediate UI selection, report failure and permit retry',async()=>{
 const h=harness({saved:'light',failWrite:true});h.render();h.mount();await flush();h.render().props.value.setAppearance('dark');await flush();
 assert.equal(h.render().props.value.appearance,'dark');assert.equal(h.render().props.value.error,'write');assert.equal(h.render().props.value.saving,false);assert.equal(h.data.get('remy.preferences.appearance'),'light');
 h.failWrite(false);h.render().props.value.setAppearance('dark');await flush();assert.equal(h.data.get('remy.preferences.appearance'),'dark');assert.equal(h.render().props.value.error,null);
});
test('rapid selections serialize writes and late hydration cannot override the latest choice',async()=>{
 const h=harness({saved:'light',deferred:true});h.render();h.mount();const set=h.render().props.value.setAppearance;
 set('dark');set('light');set('system');set('dark');await flush();h.release();await flush();
 assert.equal(h.render().props.value.appearance,'dark');assert.equal(h.data.get('remy.preferences.appearance'),'dark');assert.equal(h.render().props.value.saving,false);
});
test('system preference responds to device changes; explicit appearance does not',async()=>{
 const h=harness({saved:'system'});h.render();h.mount();await flush();assert.equal(h.render().props.value.mode,'light');h.system('dark');assert.equal(h.render().props.value.mode,'dark');
 h.render().props.value.setAppearance('light');assert.equal(h.render().props.value.mode,'light');h.system('light');h.system('dark');assert.equal(h.render().props.value.mode,'light');
 h.render().props.value.setAppearance('system');assert.equal(h.render().props.value.mode,'dark');await flush();
});
test('appearance error and status messages have English/Arabic key parity',()=>{
 const exports={};new Function('exports',ts.transpileModule(fs.readFileSync('src/i18n/appearance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
 const {en,ar}=exports.appearanceMessages;assert.deepEqual(Object.keys(en),Object.keys(ar));for(const key of Object.keys(en))assert.match(ar[key],/[\u0600-\u06ff]/u);
});
