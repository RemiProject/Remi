// Integration check for transferOwnership + requestEmailVerification. Needs a running API (API_URL) and DATABASE_URL_MIGRATOR.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
const url = process.env.API_URL ?? 'http://localhost:3000/graphql';
const gql = async (query, variables = {}, token, hh) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(hh ? { 'x-household-id': hh } : {}) }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) return { errors: j.errors.map((e) => e.extensions?.code + ':' + e.message) }; return j.data;
};
const pw = 'T3st!' + randomBytes(9).toString('base64url');
const tag = randomBytes(4).toString('hex');
const reg = (email) => gql(`mutation($i:RegisterInput!){register(input:$i){userId}}`, { i: { email, password: pw, name: 'Test ' + tag, countryCode: 'EG', localeCode: 'ar-EG', timezone: 'Africa/Cairo', languageCode: 'ar' } });
const login = async (email) => (await gql(`mutation($i:LoginInput!){login(input:$i){accessToken}}`, { i: { email, password: pw } })).login.accessToken;
const a = `owner.${tag}@example.test`, b = `member.${tag}@example.test`;
const ra = await reg(a), rb = await reg(b); console.log('register', JSON.stringify(ra), JSON.stringify(rb));
if (ra.errors) process.exit(1);
const ta = await login(a), tb = await login(b);
const hh = (await gql(`mutation($i:CreateHouseholdInput!){createHousehold(input:$i)}`, { i: { name: 'HH ' + tag, timezone: 'Africa/Cairo' } }, ta)).createHousehold;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR }); await db.connect();
await db.query(`INSERT INTO "HouseholdMember"(id,"householdId","userId",role) VALUES (gen_random_uuid(),$1,$2,'MEMBER')`, [hh, rb.register.userId]);
console.log('self transfer', JSON.stringify(await gql(`mutation($i:TransferOwnershipInput!){transferOwnership(input:$i)}`, { i: { newOwnerUserId: ra.register.userId } }, ta, hh)));
console.log('member tries transfer', JSON.stringify(await gql(`mutation($i:TransferOwnershipInput!){transferOwnership(input:$i)}`, { i: { newOwnerUserId: ra.register.userId } }, tb, hh)));
console.log('owner transfers', JSON.stringify(await gql(`mutation($i:TransferOwnershipInput!){transferOwnership(input:$i)}`, { i: { newOwnerUserId: rb.register.userId } }, ta, hh)));
console.log('roles', JSON.stringify((await db.query(`SELECT u.email LIKE 'owner%' AS was_owner, m.role FROM "HouseholdMember" m JOIN "User" u ON u.id=m."userId" WHERE m."householdId"=$1 ORDER BY 1`, [hh])).rows));
console.log('old owner leaves', JSON.stringify(await gql(`mutation{leaveHousehold}`, {}, ta, hh)));
const before = (await db.query(`SELECT count(*)::int n FROM "OutboxEvent" WHERE topic LIKE '%verif%' AND payload->>'to'=$1`, [a])).rows[0].n;
console.log('resend verification', JSON.stringify(await gql(`mutation{requestEmailVerification}`, {}, ta)));
const after = (await db.query(`SELECT count(*)::int n FROM "OutboxEvent" WHERE topic LIKE '%verif%' AND payload->>'to'=$1`, [a])).rows[0].n;
console.log('verification outbox rows', before, '->', after);
await db.end();
