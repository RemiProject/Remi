const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createAuthService, authOperations } = require('../src/services/auth-service.ts');
const { createBackendClient, BackendError } = require('../src/services/backend-core.ts');
const tokens = (id) => ({ accessToken: `test-access-${id}`, refreshToken: `test-refresh-${id}`, expiresInSeconds: 120 });
const user = { id: 'test-user', email: 'test@example.invalid', name: 'Test', timezone: 'Africa/Cairo', languageCode: 'en', emailVerifiedAt: null };
function harness(responses, initial = null) {
  let value = initial, clock = 1000000;
  const calls = [];
  const storage = { read: async () => value, write: async v => { value = v; }, clear: async () => { value = null; } };
  const client = createBackendClient('https://api.example.invalid', async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ ...body, headers: init.headers });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, 'unexpected API call');
    return Response.json(next);
  });
  const make = (url = 'https://api.example.invalid') => createAuthService(client, storage, url, () => clock);
  return { auth: make(), make, calls, storage, stored: () => value, advance: ms => { clock += ms; } };
}
const login = h => h.auth.login({ email: user.email, password: 'test-password' });

test('all auth documents validate against the actual generated backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const operation of Object.values(authOperations)) assert.deepEqual(validate(schema, parse(operation)), []);
});

test('successful login persists only tokens and expiry; me uses bearer auth and restores on restart', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { me: user } }]);
  await login(h);
  assert.deepEqual(h.calls[0].variables, { input: { email: user.email, password: 'test-password' } });
  assert.equal(h.calls[0].headers.Authorization, undefined);
  const record = JSON.parse(h.stored());
  assert.equal(record.session.expiresAt, 1120000);
  assert.equal(h.stored().includes('test-password'), false);
  assert.equal(h.stored().includes(user.email), false);
  assert.deepEqual(await h.make().me(), user);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer test-access-1');
});

test('failed login propagates backend code and stores no session', async () => {
  const h = harness([{ errors: [{ message: 'Invalid credentials', extensions: { code: 'INVALID_CREDENTIALS' } }] }]);
  await assert.rejects(login(h), e => e instanceof BackendError && e.codes.includes('INVALID_CREDENTIALS'));
  assert.equal(h.stored(), null);
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('successful password reset clears this device session after server revocation', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { resetPassword: true } }]);
  await login(h);
  await h.auth.resetPassword('test-reset-token', 'Strong123!');
  assert.equal(h.stored(), null);
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('near-expiry concurrent me calls rotate once, persist replacement, and use the new access token', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { refreshAccessToken: tokens(2) } }, { data: { me: user } }, { data: { me: user } }]);
  await login(h);
  h.advance(91000);
  await Promise.all([h.auth.me(), h.auth.me()]);
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.deepEqual(h.calls[1].variables, { input: { refreshToken: 'test-refresh-1' } });
  assert.equal(h.calls[1].headers.Authorization, undefined);
  assert.equal(h.calls[2].headers.Authorization, 'Bearer test-access-2');
  assert.equal(JSON.parse(h.stored()).session.refreshToken, 'test-refresh-2');
});

test('explicit concurrent refresh requests share one rotation', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { refreshAccessToken: tokens(2) } }]);
  await login(h);
  await Promise.all([h.auth.refreshAccessToken(), h.auth.refreshAccessToken()]);
  assert.equal(h.calls.length, 2);
});

test('me refreshes and retries once on backend UNAUTHENTICATED', async () => {
  const denied = { errors: [{ message: 'Invalid or expired token', extensions: { code: 'UNAUTHENTICATED' } }] };
  const h = harness([{ data: { login: tokens(1) } }, denied, { data: { refreshAccessToken: tokens(2) } }, { data: { me: user } }]);
  await login(h);
  assert.deepEqual(await h.auth.me(), user);
  assert.equal(h.calls.length, 4);
});

test('invalid or ambiguous refresh fails closed and never retries a consumed token', async () => {
  for (const failure of [new Error('timeout'), { errors: [{ message: 'Invalid refresh', extensions: { code: 'INVALID_REFRESH_TOKEN' } }] }]) {
    const h = harness([{ data: { login: tokens(1) } }, failure]);
    await login(h);
    await assert.rejects(h.auth.refreshAccessToken());
    assert.equal(h.stored(), null);
    await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
    assert.equal(h.calls.length, 2);
  }
});

test('a second me authentication rejection clears the session without a retry loop', async () => {
  const denied = { errors: [{ message: 'Session revoked', extensions: { code: 'UNAUTHENTICATED' } }] };
  const h = harness([{ data: { login: tokens(1) } }, denied, { data: { refreshAccessToken: tokens(2) } }, denied]);
  await login(h);
  await assert.rejects(h.auth.me());
  assert.equal(h.calls.length, 4);
  assert.equal(h.stored(), null);
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('transient me failure preserves a valid session without refreshing', async () => {
  const h = harness([{ data: { login: tokens(1) } }, new Error('offline'), { data: { me: user } }]);
  await login(h);
  await assert.rejects(h.auth.me());
  assert.ok(h.stored());
  assert.deepEqual(await h.auth.me(), user);
  assert.equal(h.calls.some(c => c.query === authOperations.refresh), false);
});

test('refresh removes persisted single-use token before dispatch', async () => {
  let stored = null;
  const storage = { read: async () => stored, write: async value => { stored = value; }, clear: async () => { stored = null; } };
  const client = { graphql: async query => {
    if (query === authOperations.login) return { login: tokens(1) };
    assert.equal(stored, null);
    return { refreshAccessToken: tokens(2) };
  } };
  const auth = createAuthService(client, storage, 'https://api.example.invalid');
  await auth.login({ email: user.email, password: 'test-password' });
  await auth.refreshAccessToken();
  assert.equal(JSON.parse(stored).session.refreshToken, 'test-refresh-2');
});

test('logout uses refresh input and bearer header, then clears persisted session', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { logout: true } }]);
  await login(h);
  await h.auth.logout();
  assert.equal(h.calls[1].query, authOperations.logout);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer test-access-1');
  assert.deepEqual(h.calls[1].variables, { input: { refreshToken: 'test-refresh-1' } });
  assert.equal(h.stored(), null);
  await h.auth.logout(); // no session: no request
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('logout refreshes expired access before guarded revocation', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { refreshAccessToken: tokens(2) } }, { data: { logout: true } }]);
  await login(h);
  h.advance(121000);
  await h.auth.logout();
  assert.equal(h.calls[2].headers.Authorization, 'Bearer test-access-2');
  assert.deepEqual(h.calls[2].variables, { input: { refreshToken: 'test-refresh-2' } });
  assert.equal(h.stored(), null);
});

test('logout reports server failure but still clears local state', async () => {
  const h = harness([{ data: { login: tokens(1) } }, new Error('offline')]);
  await login(h);
  await assert.rejects(h.auth.logout());
  assert.equal(h.stored(), null);
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('queued logout cannot be undone by an in-flight refresh', async () => {
  const h = harness([{ data: { login: tokens(1) } }, { data: { refreshAccessToken: tokens(2) } }, { data: { logout: true } }]);
  await login(h);
  await Promise.all([h.auth.refreshAccessToken(), h.auth.logout()]);
  assert.equal(h.stored(), null);
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});

test('corrupt storage and a different backend never send stored tokens', async () => {
  const h = harness([], '{invalid');
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
  assert.equal(h.stored(), null);
  const other = harness([{ data: { login: tokens(1) } }]);
  await login(other);
  await assert.rejects(other.make('https://other.example.invalid').me(), { code: 'NO_SESSION' });
  assert.equal(other.calls.length, 1);
});

test('secure storage errors fail login instead of silently persisting elsewhere', async () => {
  const h = harness([{ data: { login: tokens(1) } }]);
  h.storage.write = async () => { throw new Error('native failure'); };
  await assert.rejects(login(h), { code: 'STORAGE' });
  await assert.rejects(h.auth.me(), { code: 'NO_SESSION' });
});
