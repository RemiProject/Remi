const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { resolveBackendUrl, createBackendClient } = require('../src/services/backend-core.ts');

test('development URL selection and explicit production configuration', () => {
  const base = { development: true, platform: 'android' };
  assert.equal(resolveBackendUrl({ ...base, hostUri: '192.168.1.4:8081' }), 'http://192.168.1.4:3000');
  assert.equal(resolveBackendUrl(base), 'http://10.0.2.2:3000');
  assert.equal(resolveBackendUrl({ ...base, platform: 'web', webHostname: 'localhost' }), 'http://localhost:3000');
  assert.equal(resolveBackendUrl({ ...base, explicitUrl: 'https://api.example.com/' }), 'https://api.example.com');
  assert.throws(() => resolveBackendUrl({ ...base, development: false }), /EXPO_PUBLIC_API_URL/);
  assert.throws(() => resolveBackendUrl({ ...base, hostUri: 'abc.exp.direct:80' }), /tunnels/);
  assert.throws(() => resolveBackendUrl({ ...base, explicitUrl: 'https://user:secret@example.com' }), /credentials/);
});

test('GraphQL passes variables and auth/household headers without cookies', async () => {
  const client = createBackendClient('http://localhost:3000', async (url, init) => {
    assert.equal(url, 'http://localhost:3000/graphql');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.headers['x-household-id'], 'test-household');
    assert.deepEqual(JSON.parse(init.body).variables, { first: 1 });
    return Response.json({ data: { result: true } });
  });
  assert.deepEqual(await client.graphql('query Example { __typename }', { first: 1 }, {
    accessToken: 'test-token', householdId: 'test-household',
  }), { result: true });
});

test('GraphQL errors, invalid responses, HTTP failures, and network failures reject', async () => {
  for (const response of [Response.json({ errors: [{ message: 'Missing bearer token', extensions: { code: 'UNAUTHENTICATED' } }] }),
    Response.json({}), new Response('', { status: 503 })]) {
    await assert.rejects(createBackendClient('http://localhost:3000', async () => response).graphql('{ me { id } }'));
  }
  await assert.rejects(createBackendClient('http://localhost:3000', async () => { throw new Error('offline'); }).checkConnection(), /request failed/);
});

test('live backend: health, database-backed catalog, auth guard, and Expo web CORS', { skip: !process.env.REMY_TEST_API_URL }, async () => {
  const url = process.env.REMY_TEST_API_URL;
  const client = createBackendClient(url);
  const result = await client.checkConnection();
  assert.equal(result.__typename, 'Query');
  await assert.rejects(client.graphql('{ me { id } }'), /bearer token/i);
  const response = await fetch(`${url}/graphql`, { method: 'OPTIONS', headers: {
    Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,authorization,x-household-id',
  } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
});
