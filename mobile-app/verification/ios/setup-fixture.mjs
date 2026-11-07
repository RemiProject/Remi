import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('.', import.meta.url);
const url = 'http://localhost:3100/graphql';
let fixture;
try { fixture = JSON.parse(await readFile(new URL('credentials.json',root), 'utf8')); } catch { const stamp = Date.now(); fixture = { identifier: `native-${stamp}@cookbook.local`, username: `native${stamp}`, name: 'Remi Cookbook Demo', password: `Cookbook!${randomBytes(12).toString('hex')}`, phoneNumber: `+2010${String(stamp).slice(-8)}` }; }
async function request(query, variables = {}, token, household) {
 const response = await fetch(url, { method: 'POST', headers: {'content-type':'application/json', ...(token ? {authorization: `Bearer ${token}`} : {}), ...(household ? {'x-household-id':household} : {})}, body: JSON.stringify({query,variables}) });
 const result = await response.json(); if(result.errors)throw Error(JSON.stringify(result.errors)); return result.data;
}
let tokens;
try { tokens = (await request('mutation($input:LoginInput!){login(input:$input){accessToken refreshToken}}',{input:{identifier:fixture.identifier,password:fixture.password}})).login; }
catch { await request('mutation($input:RegisterInput!){register(input:$input){userId}}',{input:{email:fixture.identifier,username:fixture.username,name:fixture.name,password:fixture.password,phoneNumber:fixture.phoneNumber,timezone:'Africa/Cairo',languageCode:'en'}}); tokens=(await request('mutation($input:LoginInput!){login(input:$input){accessToken refreshToken}}',{input:{identifier:fixture.identifier,password:fixture.password}})).login; }
let households=(await request('{myHouseholds{household{id}}}',{},tokens.accessToken)).myHouseholds;
let household=households[0]?.household.id;
if(!household)household=(await request('mutation($input:CreateHouseholdInput!){createHousehold(input:$input)}',{input:{name:'The Cookbook Kitchen',timezone:'Africa/Cairo'}},tokens.accessToken)).createHousehold;
const existing=(await request('{inventory(first:50){nodes{id foodId}}}',{},tokens.accessToken,household)).inventory.nodes;
const foods=[['Tomato','1000','GRAM','FRIDGE',2],['Spinach','500','GRAM','FRIDGE',3],['Lemon','4','PIECE','PANTRY',null],['Plain yogurt','1000','GRAM','FRIDGE',5],['Pasta','1000','GRAM','PANTRY',30],['Garlic','200','GRAM','PANTRY',20],['Olive oil','500','MILLILITER','PANTRY',90],['Fresh basil','50','GRAM','FRIDGE',2]];
for(const [name,amount,unit,storageLocation,days] of foods){
 const matches=(await request('query($search:String!){foods(first:20,search:$search){nodes{id name}}}',{search:name},tokens.accessToken)).foods.nodes;
 const food=matches.find(f=>f.name.toLowerCase()===name.toLowerCase())??matches[0]; if(!food||existing.some(item=>item.foodId===food.id))continue;
 const expiry=days===null?undefined:new Date(Date.now()+days*86400000).toISOString();
 const result=(await request('mutation($input:InventoryStockInput!){addStock(input:$input){__typename}}',{input:{foodId:food.id,amount,unit,storageLocation,estimatedExpiryAt:expiry,idempotencyKey:randomUUID()}},tokens.accessToken,household)).addStock;
 if(result.__typename!=='InventoryMutationSuccessType')throw Error('Stock seed did not succeed');
}
await writeFile(new URL('credentials.json',root),JSON.stringify(fixture,null,2),{mode:0o600});
console.log('Independent native UI account and household fixture ready. Credentials remain local.');
