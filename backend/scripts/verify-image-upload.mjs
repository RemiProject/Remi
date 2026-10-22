// Integration check for the two-step image upload. Needs a running API (API_URL); S3 is optional:
// without S3 only the presign + validation paths are exercised.
import { randomBytes } from 'node:crypto';
const url = process.env.API_URL ?? 'http://localhost:3000/graphql';
const gql = async (query, variables = {}, token, hh) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(hh ? { 'x-household-id': hh } : {}) }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); return j.errors ? { errors: j.errors.map((e) => e.extensions?.code) } : j.data;
};
const tag = randomBytes(4).toString('hex'), pw = 'T3st!' + randomBytes(9).toString('base64url'), email = `img.${tag}@example.test`;
await gql(`mutation($i:RegisterInput!){register(input:$i){userId}}`, { i: { email, password: pw, name: 'Img ' + tag, countryCode: 'EG', localeCode: 'ar-EG', timezone: 'Africa/Cairo', languageCode: 'ar' } });
const token = (await gql(`mutation($i:LoginInput!){login(input:$i){accessToken}}`, { i: { email, password: pw } })).login.accessToken;
const hh = (await gql(`mutation($i:CreateHouseholdInput!){createHousehold(input:$i)}`, { i: { name: 'Img ' + tag, timezone: 'Africa/Cairo' } }, token)).createHousehold;
const req = (mimeType, sizeBytes) => gql(`mutation($i:RequestImageUploadInput!){requestImageUpload(input:$i){storageKey uploadUrl expiresAt}}`, { i: { mimeType, sizeBytes } }, token, hh);
const ticket = await req('image/jpeg', 1234);
console.log('ticket key scoped to household:', ticket.requestImageUpload?.storageKey.startsWith(`households/${hh}/images/`), '| url signed:', /X-Amz-Signature=/.test(ticket.requestImageUpload?.uploadUrl ?? ''));
console.log('svg rejected:', JSON.stringify(await req('image/svg+xml', 100)));
console.log('too large rejected:', JSON.stringify(await req('image/png', 50 * 1024 * 1024)));
console.log('foreign key rejected:', JSON.stringify(await gql(`mutation($i:ConfirmImageUploadInput!){confirmImageUpload(input:$i){id}}`, { i: { storageKey: 'households/00000000-0000-0000-0000-000000000000/images/x', type: 'FOOD' } }, token, hh)));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(1230)]);
const put = await fetch(ticket.requestImageUpload.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg }).catch((e) => ({ ok: false, status: e.cause?.code ?? e.message }));
if (!put.ok) { console.log('S3 not reachable, skipping upload+confirm:', put.status); process.exit(0); }
const confirm = () => gql(`mutation($i:ConfirmImageUploadInput!){confirmImageUpload(input:$i){id mimeType sizeBytes url}}`, { i: { storageKey: ticket.requestImageUpload.storageKey, type: 'FOOD' } }, token, hh);
const c1 = await confirm(), c2 = await confirm();
console.log('confirm:', JSON.stringify(c1), '| idempotent:', c1.confirmImageUpload?.id === c2.confirmImageUpload?.id);
