import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calendarDay, expiryEndOfDay, seedMyKitchen } from './seed-my-kitchen.mjs';

test('seed expiry is the final instant of the household day, including DST days', () => {
  for (const [day, zone] of [['2026-06-01', 'Africa/Cairo'], ['2026-03-08', 'America/Los_Angeles'], ['2026-11-01', 'America/Los_Angeles']]) {
    const expiry = expiryEndOfDay(day, zone);
    assert.equal(calendarDay(new Date(expiry), zone), day);
    assert.notEqual(calendarDay(new Date(Date.parse(expiry) + 1), zone), day);
  }
});

for (const count of [0, 1, 2]) {
  test(`seed uses app household selection rules with ${count} memberships and keeps credentials off disk`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'remi-kitchen-seed-test-'));
    const selectionFile = join(directory, 'selection.json');
    const calls = [];
    try {
      const result = await seedMyKitchen({ endpoint: 'http://localhost:3000/graphql', email: 'private@example.invalid', password: 'do-not-log', selectionFile,
        now: new Date('2026-06-01T23:30:00Z'), transport: async (_url, init) => {
          const { query, variables } = JSON.parse(init.body);
          calls.push({ query, variables, headers: init.headers });
          let data;
          if (query.includes('login(')) data = { login: { accessToken: 'private-access-token' } };
          else if (query.includes('me{')) data = { me: { id: 'user', emailVerifiedAt: '2026-01-01T00:00:00Z' } };
          else if (query.includes('myHouseholds')) data = { myHouseholds: Array.from({ length: count }, (_, i) => ({ household: { id: `home-${i}`, name: 'Home', timezone: 'Africa/Cairo' } })) };
          else if (query.includes('createHousehold')) data = { createHousehold: 'created' };
          else if (query.includes('foods(')) data = { foods: { nodes: [{ id: variables.search, name: variables.search }] } };
          else data = { addStock: { __typename: 'InventoryMutationSuccessType', replayed: false } };
          return Response.json({ data });
        } });
      assert.equal(result.count, 5);
      assert.equal(calls.filter(c => c.query.includes('createHousehold')).length, count === 0 ? 1 : 0);
      assert.equal(result.householdId, count === 0 ? 'created' : 'home-0');
      const adds = calls.filter(c => c.query.includes('addStock'));
      assert.equal(adds.length, 5);
      assert(new Set(adds.map(c => c.variables.input.unit)).size > 2);
      assert(new Set(adds.map(c => c.variables.input.storageLocation)).size > 2);
      assert.equal(new Set(adds.map(c => c.variables.input.idempotencyKey)).size, 5);
      assert(adds.every(c => c.headers['x-household-id'] === result.householdId));
      assert.equal(calendarDay(new Date(adds[0].variables.input.estimatedExpiryAt), result.timezone), calendarDay(new Date('2026-06-01T23:30:00Z'), result.timezone));
      assert.deepEqual(JSON.parse(await readFile(selectionFile, 'utf8')), { householdId: result.householdId });
      assert.doesNotMatch(await readFile(selectionFile, 'utf8'), /private|do-not-log/);
    } finally {
      await unlink(selectionFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await rmdir(directory);
    }
  });
}

test('seed refuses a remote backend without sending credentials', async () => {
  await assert.rejects(seedMyKitchen({ endpoint: 'https://example.com/graphql', email: 'secret', password: 'secret', transport: () => { throw new Error('Must not run'); } }), /only supports a local backend/);
});

test('backend errors never echo credentials or raw server error bodies', async () => {
  await assert.rejects(seedMyKitchen({ email: 'secret-email', password: 'secret-password', transport: async () => Response.json({ errors: [{ message: 'secret-email secret-password' }] }) }), error => {
    assert.doesNotMatch(error.message, /secret-email|secret-password/);
    return true;
  });
});
