import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
const base = process.env.COOKBOOK_TEST_API ?? 'http://127.0.0.1:3100';
const url = new URL(base);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '3100') throw new Error('This verifier only writes to the isolated local cookbook API on port 3100.');
async function gql(query, variables = {}, session, householdId = session?.householdId) {
  const response = await fetch(`${base}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(householdId ? { 'x-household-id': householdId } : {}) }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors.map(error => `${error.extensions?.code ?? 'ERROR'}: ${error.message}`).join('; '));
  assert.ok(response.ok); return json.data;
}
async function account(label) {
  const suffix = randomBytes(5).toString('hex'); const username = `intake_${label}_${suffix}`; const email = `${username}@example.test`; const password = `Cook!9${randomBytes(12).toString('hex')}`;
  await gql('mutation($input:RegisterInput!){register(input:$input){userId}}', { input: { email, username, password, phoneNumber: `+2010${String(randomInt(100000000)).padStart(8, '0')}`, name: 'Cookbook verification', countryCode: 'EG', localeCode: 'en-US', languageCode: 'en', timezone: 'Africa/Cairo' } });
  const { login } = await gql('mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { identifier: email, password } });
  const session = { token: login.accessToken };
  const result = await gql('mutation($input:CreateHouseholdInput!){createHousehold(input:$input)}', { input: { name: 'Disposable cookbook verification', timezone: 'Africa/Cairo' } }, session);
  return { ...session, householdId: result.createHousehold };
}
const fields = 'id name portions cookedOn useBy storage status notes';
const saveQuery = `mutation($input:SaveCookbookLeftoverInput!){saveCookbookLeftover(input:$input){${fields}}}`;
let passed = 0;
async function step(label, run) { await run(); passed++; console.log(`PASS ${passed}. ${label}`); }
const a = await account('a'); const b = await account('b');
const input = { id: randomUUID(), name: 'Test tomato pasta', portions: 2, cookedOn: '2026-11-03', useBy: '2026-11-04', storage: 'FRIDGE', notes: 'Disposable verification record' };
await step('save and replay create one household leftover', async () => {
  const first = await gql(saveQuery, { input }, a); const replay = await gql(saveQuery, { input }, a); assert.deepEqual(first, replay);
  const list = await gql(`query{cookbookLeftovers{${fields}}}`, {}, a); assert.equal(list.cookbookLeftovers.filter(item => item.id === input.id).length, 1);
});
await step('same save key cannot overwrite a different draft', async () => { await assert.rejects(() => gql(saveQuery, { input: { ...input, portions: 3 } }, a), /IDEMPOTENCY_KEY_REUSED/); });
await step('invalid dates are rejected at the API boundary', async () => { await assert.rejects(() => gql(saveQuery, { input: { ...input, id: randomUUID(), cookedOn: '2026-02-30' } }, a), /BAD_REQUEST/); });
await step('leftover status changes persist and can be undone', async () => {
  const query = `mutation($id:ID!,$status:String!){setCookbookLeftoverStatus(id:$id,status:$status){${fields}}}`;
  assert.equal((await gql(query, { id: input.id, status: 'EATEN' }, a)).setCookbookLeftoverStatus.status, 'EATEN');
  assert.equal((await gql(query, { id: input.id, status: 'STORED' }, a)).setCookbookLeftoverStatus.status, 'STORED');
});
await step('other households cannot see or update leftovers', async () => {
  assert.equal((await gql(`query{cookbookLeftovers{${fields}}}`, {}, b)).cookbookLeftovers.length, 0);
  await assert.rejects(() => gql('mutation($id:ID!,$status:String!){setCookbookLeftoverStatus(id:$id,status:$status){id}}', { id: input.id, status: 'EATEN' }, b), /NOT_FOUND/);
  await assert.rejects(() => gql('query{cookbookLeftovers{id}}', {}, b, a.householdId), /FORBIDDEN/);
});
let imageId;
await step('actual image bytes upload, confirm and appear in the household archive', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=', 'base64');
  const { requestImageUpload: ticket } = await gql('mutation($input:RequestImageUploadInput!){requestImageUpload(input:$input){storageKey uploadUrl contentType}}', { input: { mimeType: 'image/png', sizeBytes: bytes.length } }, a);
  const upload = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: bytes }); assert.ok(upload.ok);
  const confirmQuery = 'mutation($input:ConfirmImageUploadInput!){confirmImageUpload(input:$input){id type sizeBytes}}';
  const confirmInput = { storageKey: ticket.storageKey, type: 'RECEIPT' };
  const first = await gql(confirmQuery, { input: confirmInput }, a); const replay = await gql(confirmQuery, { input: confirmInput }, a); assert.deepEqual(first, replay); imageId = first.confirmImageUpload.id;
  assert.equal(first.confirmImageUpload.sizeBytes, bytes.length);
  const archive = await gql('query{cookbookImages{id type url}}', {}, a); const image = archive.cookbookImages.find(item => item.id === imageId); assert.equal(image.type, 'RECEIPT');
  const download = await fetch(image.url); assert.ok(download.ok); assert.equal((await download.arrayBuffer()).byteLength, bytes.length);
});
await step('images stay isolated between household accounts', async () => {
  const archive = await gql('query{cookbookImages{id}}', {}, b); assert.equal(archive.cookbookImages.length, 0);
  await assert.rejects(() => gql('query($id:ID!){image(id:$id){id}}', { id: imageId }, b), /IMAGE_NOT_FOUND/);
});
await step('feedback persists idempotently and remains private to its author and household', async () => {
  const input = { id: randomUUID(), subject: 'Verification feedback', message: 'A disposable saved feedback message.' };
  const query = 'mutation($input:SubmitCookbookFeedbackInput!){submitCookbookFeedback(input:$input){id subject message}}';
  const first = await gql(query, { input }, a); const replay = await gql(query, { input }, a); assert.deepEqual(first, replay);
  await assert.rejects(() => gql(query, { input: { ...input, message: 'Different payload' } }, a), /IDEMPOTENCY_KEY_REUSED/);
  const mine = await gql('query{myCookbookFeedback{id subject message}}', {}, a); assert.equal(mine.myCookbookFeedback.filter(item => item.id === input.id).length, 1);
  const other = await gql('query{myCookbookFeedback{id}}', {}, b); assert.equal(other.myCookbookFeedback.length, 0);
});
console.log(`Verified ${passed} live intake/leftover checks against ${base}; only disposable test users and households were created.`);
