/* eslint-disable no-console -- This CLI reports verification results to the terminal. */
// Development-only HTTP integration checks. Requires the running API, catalog/reference seeds and Mailpit.
// Run: node backend/scripts/verify-recipe-suggestions.mjs
// Creates disposable users/households/private recipes/stock; never deletes existing data or logs tokens.
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SUGGESTIONS_QUERY = `query Suggestions($first:Int!, $after:String) {
  recipeSuggestions(first:$first, after:$after) {
    totalCount hasNextPage endCursor missingStapleNames
    nodes {
      recipe { id name description servings prepTimeMin cookTimeMin difficulty cuisineId cuisineName householdId }
      coverageRatio haveCount requiredCount safetyWarnings
      missing { foodId foodName status }
      short { foodId missingAmount unit }
      unknown { foodId knownAvailableAmount status }
      assumedStaples { foodId status }
      optional { foodId status }
      expiringSoon { foodId expiryDay }
    }
  }
}`;

export async function verifyRecipeSuggestions({ endpoint = process.env.API_URL ?? 'http://localhost:3000/graphql',
  mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025', report = console.log } = {}) {
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname)) {
    throw new Error('This verification script only runs against a local development backend.');
  }
  let passed = 0, failed = 0;
  const run = randomBytes(8).toString('hex');
  const gql = async (query, variables = {}, session = {}) => {
    const response = await fetch(endpoint, { method: 'POST', headers: {
      'content-type': 'application/json', 'apollo-require-preflight': 'true',
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(session.householdId ? { 'x-household-id': session.householdId } : {}),
    }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) });
    const body = await response.json();
    if (!response.ok || body.errors?.length) {
      const error = new Error(JSON.stringify(body.errors ?? { status: response.status }));
      error.codes = body.errors?.map(e => e.extensions?.code) ?? [];
      throw error;
    }
    return body.data;
  };
  const check = async (label, fn) => {
    try { const detail = await fn(); passed++; report(`PASS ${label}${detail ? ` | ${detail}` : ''}`); }
    catch (error) { failed++; report(`FAIL ${label} | ${error.message}`); }
  };
  const register = async suffix => {
    const username = `rs_${run}_${suffix}`, email = `${username}@example.test`;
    const password = `Rs!A9${randomBytes(16).toString('hex')}`;
    const { register: user } = await gql('mutation($input:RegisterInput!){register(input:$input){userId}}', { input: {
      email, username, password, phoneNumber: `+2010${String(randomInt(100_000_000)).padStart(8, '0')}`,
      name: 'Recipe suggestions verification', countryCode: 'EG', localeCode: 'en-US', languageCode: 'en', timezone: 'Africa/Cairo',
    } });
    let verified = false;
    const deadline = Date.now() + 30_000;
    while (!verified && Date.now() < deadline) {
      const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(5000) });
      assert.ok(response.ok, 'Mailpit is available');
      for (const message of (await response.json()).messages ?? []) {
        if (!message.To?.some(r => r.Address === email)) continue;
        const detail = await (await fetch(`${mailpit}/api/v1/message/${message.ID}`, { signal: AbortSignal.timeout(5000) })).json();
        const match = `${detail.Text}\n${detail.HTML}`.match(/verify-email\?token=([^\s"'<>]+)/);
        if (!match) continue;
        const result = await gql('mutation($input:TokenInput!){verifyEmail(input:$input)}', { input: { token: decodeURIComponent(match[1].split('&')[0]) } });
        verified = result.verifyEmail;
        break;
      }
      if (!verified) await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(verified, 'test email verified via Mailpit');
    const { login } = await gql('mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { identifier: email, password } });
    const session = { token: login.accessToken, userId: user.userId };
    const created = await gql('mutation($input:CreateHouseholdInput!){createHousehold(input:$input)}', { input: { name: `Recipes ${run} ${suffix}`, timezone: 'Africa/Cairo' } }, session);
    return { ...session, householdId: created.createHousehold };
  };
  const suggestions = async (session, first = 10, after) => (await gql(SUGGESTIONS_QUERY, { first, after }, session)).recipeSuggestions;
  const idsQuery = 'query($first:Int!,$after:String){recipeSuggestions(first:$first,after:$after){nodes{recipe{id householdId} haveCount requiredCount}totalCount hasNextPage endCursor}}';
  const all = async (session, first = 50) => {
    const nodes = []; let after;
    do {
      const page = (await gql(idsQuery, { first, after }, session)).recipeSuggestions;
      nodes.push(...page.nodes); after = page.endCursor;
      if (!page.hasNextPage) break;
      assert.ok(after && nodes.length <= page.totalCount, 'bounded pagination');
    } while (after);
    return nodes;
  };
  const inventory = async session => (await gql('query{inventory(first:50){nodes{id foodId quantity unit version}}}', {}, session)).inventory.nodes;
  report(`Recipe suggestions verification | endpoint=${endpoint}`);
  // Setup failure ends the run instead of producing misleading dependent checks.
  const a = await register('a'), b = await register('b');
  await check('register and verify two isolated users/households', () => { assert.notEqual(a.householdId, b.householdId); return 'expected=two distinct households; actual=two'; });
  const foods = {};
  for (const name of ['tomato', 'carrot', 'olive oil', 'salt', 'water', 'black pepper']) {
    const data = await gql('query($search:String!){foods(search:$search,first:50){nodes{id name category{id} aliases{alias languageCode isPrimary}}}}', { search: name }, a);
    foods[name] = data.foods.nodes.find(f => f.name.toLowerCase() === name);
    assert.ok(foods[name], `catalog contains ${name}`);
  }
  const performanceSamples = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const page = await suggestions(b);
    performanceSamples.push(Number((performance.now() - start).toFixed(1)));
    assert.ok(page.totalCount > 0, 'imported recipes are visible without saved safety records');
  }
  const globalCount = (await suggestions(b, 1)).totalCount;
  report(`TIMING global eligible recipes=${globalCount}; first=10 HTTP requests (ms)=${performanceSamples.join(', ')}; includes auth, DB, full ranking and serialization`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const day = delta => new Date(Date.parse(`${today}T12:00:00Z`) + delta * 86_400_000).toISOString();
  const stock = async (food, amount, unit, estimatedExpiryAt) => {
    const data = await gql('mutation($input:InventoryStockInput!){addStock(input:$input){__typename}}', { input: {
      foodId: foods[food].id, amount, unit, estimatedExpiryAt, idempotencyKey: `rs-${run}-${randomBytes(6).toString('hex')}`,
    } }, a);
    assert.equal(data.addStock.__typename, 'InventoryMutationSuccessType');
  };
  await stock('tomato', '1000', 'GRAM', day(1));
  await stock('carrot', '1000', 'GRAM', day(-1));
  await stock('olive oil', '1000', 'MILLILITER');
  const ing = (name, quantity = '1', unit = 'GRAM', optional = false) => ({ foodId: foods[name].id, quantity, unit, optional });
  const create = async (session, label, ingredients) => (await gql('mutation($input:CreateRecipeInputType!){createRecipe(input:$input){id}}', { input: {
    name: `! ${run} ${label}`, description: 'Development verification fixture', servings: 1,
    prepTimeMin: 0, cookTimeMin: 0, difficulty: 'EASY', ingredients, steps: [{ instruction: 'Verification fixture; not cooking guidance.' }],
  } }, session)).createRecipe.id;
  const owned = await create(a, 'owned', [ing('tomato'), ing('olive oil', '1', 'MILLILITER'), ing('salt'), ing('carrot', '1', 'GRAM', true)]);
  const expired = await create(a, 'expired', [ing('carrot')]);
  const short = await create(a, 'short', [ing('tomato', '2000')]);
  const unknown = await create(a, 'unknown', [ing('olive oil', '1', 'PIECE')]);
  const assumed = await create(a, 'assumed', [ing('water', '1', 'MILLILITER'), ing('salt'), ing('black pepper', '1', 'GRAM', true)]);
  const foreign = await create(b, 'foreign', [ing('tomato')]);
  const before = await inventory(a);
  let allA;
  await check('rank the full visible set before pagination; real stock changes coverage', async () => {
    allA = await all(a);
    const own = allA.find(n => n.recipe.id === owned);
    assert.equal(own.haveCount, 2); assert.equal(own.requiredCount, 2);
    assert.ok(allA.findIndex(n => n.recipe.id === owned) < allA.findIndex(n => n.recipe.id === expired));
    assert.equal(allA.at(-1).recipe.id, assumed);
    return 'expected=owned coverage 2/2 ahead of missing; staples-only last; actual=matched';
  });
  // Detail selection is deliberately small to respect the existing GraphQL complexity limit.
  const details = new Map();
  let after;
  do {
    const page = (await gql(SUGGESTIONS_QUERY, { first: 50, after }, a)).recipeSuggestions;
    for (const n of page.nodes) if ([owned, expired, short, unknown, assumed].includes(n.recipe.id)) details.set(n.recipe.id, n);
    after = page.endCursor;
    if (!page.hasNextPage) break;
  } while (details.size < 5);
  await check('expired stock is MISSING; tomorrow is reported as expiring soon', () => {
    assert.ok(details.get(expired).missing.some(i => i.foodId === foods.carrot.id && i.status === 'MISSING'));
    const soon = details.get(owned).expiringSoon.find(i => i.foodId === foods.tomato.id);
    assert.equal(soon.expiryDay, day(1).slice(0, 10));
    return `expected=carrot missing, tomato expiry ${day(1).slice(0, 10)}; actual=matched`;
  });
  await check('SHORT, UNKNOWN, optional and ASSUMED explanations preserve engine semantics', () => {
    assert.deepEqual(details.get(short).short, [{ foodId: foods.tomato.id, missingAmount: '1000.000', unit: 'GRAM' }]);
    assert.equal(details.get(unknown).unknown[0].status, 'UNKNOWN'); assert.equal(details.get(unknown).haveCount, 1);
    assert.ok(details.get(owned).optional.some(i => i.foodId === foods.carrot.id && i.status === 'MISSING'));
    assert.equal(details.get(owned).assumedStaples[0].foodId, foods.salt.id);
    assert.equal(details.get(assumed).requiredCount, 0); assert.equal(details.get(assumed).coverageRatio, 0);
  });
  await check('food names and Arabic aliases use the catalog contract', async () => {
    const data = await gql('query{recipeSuggestions(first:1){nodes{expiringSoon{foodId foodName aliases{alias}}}}}', {}, a);
    const item = data.recipeSuggestions.nodes[0].expiringSoon.find(i => i.foodId === foods.tomato.id);
    assert.equal(item.foodName, 'tomato'); assert.ok(item.aliases.some(alias => alias.alias === 'طماطم'));
  });
  await check('global and own private recipes only; cursor cannot cross users/households', async () => {
    assert.ok(!allA.some(n => n.recipe.id === foreign));
    const allB = await all(b); assert.ok(allB.some(n => n.recipe.id === foreign)); assert.ok(!allB.some(n => n.recipe.id === owned));
    const first = await suggestions(a, 1);
    await assert.rejects(suggestions(b, 1, first.endCursor), error => error.codes.includes('STALE_RECIPE_SUGGESTIONS_CURSOR'));
    await assert.rejects(suggestions({ ...b, householdId: a.householdId }), error => error.codes.includes('FORBIDDEN'));
  });
  await check('stable pagination across page sizes, without duplicate or skipped recipes', async () => {
    const repeated = await all(a, 37);
    assert.deepEqual(repeated.map(n => n.recipe.id), allA.map(n => n.recipe.id));
    assert.equal(new Set(repeated.map(n => n.recipe.id)).size, repeated.length);
  });
  await check('guards, invalid page size and malformed cursors are rejected', async () => {
    await assert.rejects(suggestions({}), error => error.codes.includes('UNAUTHENTICATED'));
    await assert.rejects(suggestions({ token: a.token }), error => error.codes.includes('FORBIDDEN'));
    await assert.rejects(suggestions(a, 0), error => error.codes.includes('INVALID_PAGE_SIZE'));
    await assert.rejects(suggestions(a, 51), error => error.codes.includes('INVALID_PAGE_SIZE'));
    await assert.rejects(suggestions(a, 1, 'invalid'), error => error.codes.includes('INVALID_CURSOR'));
  });
  const addAllergy = async foodId => gql('mutation($input:AllergyInputType!){addAllergy(input:$input){allergies{foodId}}}', { input: { foodId, severity: 'SEVERE' } }, a);
  const removeAllergy = async foodId => gql('mutation($input:RemoveAllergyInputType!){removeAllergy(input:$input)}', { input: { foodId } }, a);
  await check('safety excludes recipes with a forbidden optional ingredient; another user is unaffected', async () => {
    const cursor = (await suggestions(a, 1)).endCursor;
    await addAllergy(foods.carrot.id);
    const safe = await all(a);
    assert.ok(!safe.some(n => n.recipe.id === owned || n.recipe.id === expired));
    await assert.rejects(suggestions(a, 1, cursor), error => error.codes.includes('STALE_RECIPE_SUGGESTIONS_CURSOR'));
    assert.ok((await all(b)).some(n => n.recipe.id === foreign));
    await removeAllergy(foods.carrot.id);
  });
  await check('assumed staples never bypass safety', async () => {
    await addAllergy(foods.salt.id);
    const safe = await all(a);
    assert.ok(!safe.some(n => n.recipe.id === owned || n.recipe.id === assumed));
    await removeAllergy(foods.salt.id);
  });
  await check('suggestion reads do not consume, reserve or change inventory', async () => { assert.deepEqual(await inventory(a), before); });
  await check('inventory changes invalidate an old cursor with a clear restart error', async () => {
    const cursor = (await suggestions(a, 1)).endCursor;
    await stock('carrot', '1', 'GRAM');
    await assert.rejects(suggestions(a, 1, cursor), error => error.codes.includes('STALE_RECIPE_SUGGESTIONS_CURSOR'));
  });
  report(`${failed ? 'FAIL' : 'PASS'}: ${passed}/${passed + failed} checks passed. Test accounts and fixtures remain in the database.`);
  return { passed, failed, globalCount, performanceSamples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await verifyRecipeSuggestions(); if (result.failed) process.exitCode = 1; }
  catch (error) { console.error(`FAIL setup/integration | ${error.message}`); process.exitCode = 1; }
}
