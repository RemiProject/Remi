// Development only. Existing account credentials come from env or hidden prompts.
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

export function calendarDay(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function expiryEndOfDay(day, timezone) {
  // Find the first instant of the next local calendar day. This also handles
  // 23/25-hour days and zones whose DST transition happens at midnight.
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  let lo = midnight - 36 * 3600000, hi = midnight + 48 * 3600000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calendarDay(new Date(mid), timezone) <= day) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo - 1).toISOString();
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Set KITCHEN_SEED_EMAIL and KITCHEN_SEED_PASSWORD, or run in an interactive terminal.');
  process.stdout.write(label);
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try { return await prompt.question(''); }
  finally { prompt.close(); process.stdout.write('\n'); }
}

export async function seedMyKitchen({ endpoint, email, password, transport = fetch, now = new Date(), selectionFile } = {}) {
  const url = new URL(endpoint ?? process.env.API_URL ?? 'http://localhost:3000/graphql');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('This development seed script only supports a local backend outside production.');
  }
  if (!email || !password) throw new Error('An existing account email and password are required.');
  let token, householdId;
  async function gql(operation, query, variables = {}) {
    let response;
    try {
      response = await transport(url.href, {
        method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(householdId ? { 'x-household-id': householdId } : {}) },
        body: JSON.stringify({ query, variables }),
      });
    } catch { throw new Error(`${operation}: could not reach the local backend.`); }
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`${operation}: invalid backend response.`); }
    // Never print request variables, raw server errors, credentials or tokens.
    if (!response.ok || result.errors?.length || !result.data) {
      throw new Error(`${operation} failed (HTTP ${response.status}). Check the account, email verification and backend setup.`);
    }
    return result.data;
  }
  const loggedIn = await gql('Login', 'mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { identifier: email, password } });
  token = loggedIn.login?.accessToken;
  if (!token) throw new Error('Login returned no access token.');
  const { me } = await gql('Account', 'query{me{id emailVerifiedAt}}');
  if (!me?.emailVerifiedAt) throw new Error('Verify the account email before seeding inventory.');
  const file = selectionFile ?? join(tmpdir(), `remi-kitchen-${createHash('sha256').update(JSON.stringify([url.href, me.id])).digest('hex')}.json`);
  let savedId = process.env.KITCHEN_SEED_HOUSEHOLD_ID;
  if (!savedId) {
    try { savedId = JSON.parse(await readFile(file, 'utf8')).householdId; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read the development household selection file.'); }
  }
  const { myHouseholds } = await gql('Households', 'query{myHouseholds{household{id name timezone}}}');
  if (!Array.isArray(myHouseholds)) throw new Error('Invalid household memberships.');
  if (process.env.KITCHEN_SEED_HOUSEHOLD_ID && !myHouseholds.some(m => m.household.id === savedId)) throw new Error('KITCHEN_SEED_HOUSEHOLD_ID must be a membership of this account.');
  let household = myHouseholds.find(m => m.household.id === savedId)?.household ?? myHouseholds[0]?.household;
  if (!household) {
    const input = { name: 'My Kitchen', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const result = await gql('Create household', 'mutation($input:CreateHouseholdInput!){createHousehold(input:$input)}', { input });
    household = { id: result.createHousehold, ...input };
  }
  householdId = household.id;
  if (!householdId) throw new Error('No household was returned.');
  await writeFile(file, JSON.stringify({ householdId }), { mode: 0o600 });
  const today = calendarDay(now, household.timezone);
  const samples = [
    { search: 'tomato', amount: '2', unit: 'PIECE', storageLocation: 'FRIDGE', days: 0 },
    { search: 'whole milk', amount: '1.25', unit: 'LITER', storageLocation: 'FRIDGE', days: 2 },
    { search: 'white rice', amount: '0.75', unit: 'KILOGRAM', storageLocation: 'PANTRY', days: 30 },
    { search: 'carrot', amount: '500', unit: 'GRAM', storageLocation: 'FREEZER', days: 10 },
    { search: 'olive oil', amount: '2', unit: 'TABLESPOON', storageLocation: 'COUNTER', days: 14 },
  ];
  // Resolve all catalog entries before creating any stock, avoiding partial data
  // when a fresh backend has not had its starter catalog seeded.
  const inputs = [];
  for (const sample of samples) {
    const { foods } = await gql('Catalog lookup', 'query($search:String!){foods(search:$search,first:20){nodes{id name}}}', { search: sample.search });
    const food = foods.nodes.find(f => f.name.toLowerCase() === sample.search) ?? foods.nodes[0];
    if (!food) throw new Error('A sample food is missing. Run pnpm seed:catalog first.');
    const day = new Date(Date.parse(`${today}T00:00:00Z`) + sample.days * 86400000).toISOString().slice(0, 10);
    inputs.push({ foodId: food.id, amount: sample.amount, unit: sample.unit, storageLocation: sample.storageLocation,
      estimatedExpiryAt: expiryEndOfDay(day, household.timezone), idempotencyKey: `dev-kitchen-${randomUUID()}` });
  }
  for (const input of inputs) {
    const { addStock } = await gql('Add sample food', 'mutation($input:InventoryStockInput!){addStock(input:$input){__typename ... on InventoryMutationSuccessType{replayed}}}', { input });
    if (addStock.__typename !== 'InventoryMutationSuccessType') throw new Error('Sample stock was not added.');
  }
  return { count: inputs.length, householdId, timezone: household.timezone };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const email = process.env.KITCHEN_SEED_EMAIL ?? await hiddenPrompt('Existing account email (hidden): ');
    const password = process.env.KITCHEN_SEED_PASSWORD ?? await hiddenPrompt('Password (hidden): ');
    const result = await seedMyKitchen({ email, password });
    console.log(`Added ${result.count} sample foods; one expires today in ${result.timezone}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
