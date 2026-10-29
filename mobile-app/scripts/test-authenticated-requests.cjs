const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { createAuthService, authOperations } = require('../src/services/auth-service.ts');
const { createBackendClient, BackendError } = require('../src/services/backend-core.ts');
const { isSignedOutError } = require('../src/services/auth-validation.ts');
const { loadMyHouseholds, myHouseholdsQuery } = require('../src/services/households-service.ts');
const query = 'query Example($id: ID!) { example(id: $id) }';
const denied = () => Response.json({ errors: [{ message: 'Expired', extensions: { code: 'UNAUTHENTICATED' } }] });
const tokens = id => ({ accessToken: `access-${id}`, refreshToken: `refresh-${id}`, expiresInSeconds: 120 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness(transport, { factory = createAuthService, initial = null, loginResponse = () => Response.json({ data: { login: tokens(1) } }) } = {}) {
  let stored = initial, clock = 1000000;
  const calls = [];
  const storage = { read: async () => stored, write: async value => { stored = value; }, clear: async () => { stored = null; } };
  const client = createBackendClient('https://api.example.invalid', async (_url, init) => {
    const call = { ...JSON.parse(init.body), headers: init.headers };
    calls.push(call);
    if (call.query === authOperations.login) return loginResponse(call);
    return transport(call);
  });
  const auth = factory(client, storage, 'https://api.example.invalid', () => clock);
  return {
    auth, calls, storage, stored: () => stored, advance: ms => { clock += ms; },
    login: () => auth.login({ identifier: 'test@example.invalid', password: 'test-password' }),
  };
}

// Inspect the private revision only in this in-memory test build. Production
// exposes neither the revision nor tokens. This verifies every lifecycle path.
const source = fs.readFileSync('src/services/auth-service.ts', 'utf8');
const inspectedSource = source.replace(/return \{\s+authenticatedGraphql,/, 'return { revisionForTest: () => identityRevision, authenticatedGraphql,');
assert.notEqual(inspectedSource, source);
const inspected = {};
const localRequire = require('node:module').createRequire(require.resolve('../src/services/auth-service.ts'));
new Function('require', 'exports', ts.transpileModule(inspectedSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(localRequire, inspected);
const revisionHarness = (transport, options = {}) => harness(transport, { ...options, factory: inspected.createAuthService });

for (const [code, message] of [['FORBIDDEN', 'Not an active member of this household'], ['EMAIL_NOT_VERIFIED', 'Please verify your email first']]) {
  test(`${code} is an ordinary error: no refresh and no sign-out`, async () => {
    const h = harness(() => Response.json({ errors: [{ message, extensions: { code, status: 403 } }] }));
    await h.login();
    const saved = h.stored();
    await assert.rejects(h.auth.authenticatedGraphql(query, {}, 'wrong-household'), error =>
      error instanceof BackendError && error.codes.includes(code) && !isSignedOutError(error));
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 0);
    assert.equal(h.stored(), saved);
  });

  test(`${code} after an access-token refresh preserves the refreshed session`, async () => {
    const h = harness(call => {
      if (call.query === authOperations.refresh) return Response.json({ data: { refreshAccessToken: tokens(2) } });
      return call.headers.Authorization === 'Bearer access-1' ? denied()
        : Response.json({ errors: [{ message, extensions: { code, status: 403 } }] });
    });
    await h.login();
    await assert.rejects(h.auth.authenticatedGraphql(query), error => error.codes.includes(code) && !isSignedOutError(error));
    assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
    assert.equal(JSON.parse(h.stored()).session.accessToken, 'access-2');
  });
}

test('HTTP 403 is not an access-token failure', async () => {
  const h = harness(() => new Response('', { status: 403 }));
  await h.login();
  const saved = h.stored();
  await assert.rejects(h.auth.authenticatedGraphql(query), { status: 403 });
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 0);
  assert.equal(h.stored(), saved);
});

test('protected me query can return an unverified user without refreshing or signing out', async () => {
  const me = { id: 'user-a', emailVerifiedAt: null };
  const h = harness(() => Response.json({ data: { me } }));
  await h.login();
  const saved = h.stored();
  assert.deepEqual(await h.auth.authenticatedGraphql(authOperations.me), { me });
  assert.equal(h.calls.length, 2);
  assert.equal(h.stored(), saved);
});

test('restoring valid session and discarding invalid/backend-mismatched storage advance identity revision', async () => {
  const valid = JSON.stringify({ version: 1, backendUrl: 'https://api.example.invalid', session: { ...tokens(1), expiresAt: 1120000 } });
  const h = revisionHarness(() => Response.json({ data: { example: true } }), { initial: valid });
  assert.equal(h.auth.revisionForTest(), 0);
  await h.auth.authenticatedGraphql(query);
  assert.equal(h.auth.revisionForTest(), 1);
  await h.auth.authenticatedGraphql(query);
  assert.equal(h.auth.revisionForTest(), 1);
  for (const initial of ['{invalid', valid.replace('api.example.invalid', 'other.example.invalid')]) {
    const bad = revisionHarness(() => { throw new Error('Unexpected request'); }, { initial });
    await assert.rejects(bad.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
    assert.equal(bad.auth.revisionForTest(), 1);
    assert.equal(bad.stored(), null);
  }
});

test('successful login advances revision; a failed login that preserves session does not', async () => {
  let failLogin = false;
  const h = revisionHarness(() => Response.json({ data: { example: true } }), {
    loginResponse: () => failLogin ? denied() : Response.json({ data: { login: tokens(1) } }),
  });
  await h.login();
  assert.equal(h.auth.revisionForTest(), 1);
  await h.login();
  assert.equal(h.auth.revisionForTest(), 2);
  const saved = h.stored();
  failLogin = true;
  await assert.rejects(h.login());
  assert.equal(h.auth.revisionForTest(), 2);
  assert.equal(h.stored(), saved);
});

test('invalid login tokens and login persistence failures advance revision when clearing session', async () => {
  for (const failure of ['invalid-tokens', 'storage']) {
    const h = revisionHarness(() => { throw new Error('Unexpected request'); }, {
      loginResponse: () => Response.json({ data: { login: failure === 'invalid-tokens' ? {} : tokens(1) } }),
    });
    if (failure === 'storage') h.storage.write = async () => { throw new Error('Storage failed'); };
    await assert.rejects(h.login());
    assert.equal(h.auth.revisionForTest(), 1);
    assert.equal(h.stored(), null);
  }
});

test('password reset and logout success/failure advance revision on sign-out', async () => {
  for (const action of ['reset', 'logout', 'failed-logout']) {
    const h = revisionHarness(() => {
      if (action === 'failed-logout') throw new Error('Offline');
      return Response.json({ data: { resetPassword: true, logout: true } });
    });
    await h.login();
    const before = h.auth.revisionForTest();
    if (action === 'reset') await h.auth.resetPassword('reset-token', 'Strong123!');
    else if (action === 'failed-logout') await assert.rejects(h.auth.logout());
    else await h.auth.logout();
    assert.ok(h.auth.revisionForTest() > before);
    assert.equal(h.stored(), null);
  }
});

test('successful explicit, proactive me and proactive request rotations preserve revision', async () => {
  for (const action of ['explicit', 'me', 'request']) {
    const h = revisionHarness(call => Response.json({ data: call.query === authOperations.refresh
      ? { refreshAccessToken: tokens(2) } : { me: { id: 'user-a' }, example: true } }));
    await h.login();
    const before = h.auth.revisionForTest();
    if (action === 'explicit') await h.auth.refreshAccessToken();
    else {
      h.advance(121000);
      if (action === 'me') await h.auth.me();
      else await h.auth.authenticatedGraphql(query);
    }
    assert.equal(h.auth.revisionForTest(), before);
    assert.equal(JSON.parse(h.stored()).session.accessToken, 'access-2');
  }
});

test('all terminal refresh failures advance revision, including storage and invalid response failures', async () => {
  for (const failure of ['offline', 'invalid-refresh', 'invalid-tokens', 'write', 'clear']) {
    const h = revisionHarness(() => {
      if (failure === 'offline') throw new Error('Offline');
      if (failure === 'invalid-refresh') return denied();
      return Response.json({ data: { refreshAccessToken: failure === 'invalid-tokens' ? {} : tokens(2) } });
    });
    await h.login();
    const before = h.auth.revisionForTest();
    if (failure === 'write') h.storage.write = async () => { throw new Error('Write failed'); };
    if (failure === 'clear') h.storage.clear = async () => { throw new Error('Clear failed'); };
    await assert.rejects(h.auth.refreshAccessToken());
    assert.equal(h.auth.revisionForTest(), before + 1, failure);
    await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
  }
});

test('me and authenticated request terminal unauthorized clears advance revision', async () => {
  for (const action of ['me', 'request', 'proactive-request']) {
    const h = revisionHarness(call => call.query === authOperations.refresh
      ? Response.json({ data: { refreshAccessToken: tokens(2) } }) : denied());
    await h.login();
    const before = h.auth.revisionForTest();
    if (action === 'proactive-request') h.advance(121000);
    if (action === 'me') await assert.rejects(h.auth.me());
    else await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
    assert.equal(h.auth.revisionForTest(), before + 1, action);
    assert.equal(h.stored(), null);
  }
});

test('register has no auto-login; reset requests, references and verification do not replace session', async () => {
  const h = revisionHarness(() => Response.json({ data: {
    register: { userId: 'new-user' }, requestPasswordReset: true, countries: [], locales: [], verifyEmail: true,
  } }));
  await h.auth.register({ email: 'new@example.invalid' });
  assert.equal(h.auth.revisionForTest(), 0);
  assert.equal(h.stored(), null);
  await h.login();
  const before = h.auth.revisionForTest(), saved = h.stored();
  await h.auth.register({ email: 'other@example.invalid' });
  await h.auth.requestPasswordReset('new@example.invalid');
  await h.auth.registrationReferences();
  await h.auth.authenticatedGraphql('mutation { verifyEmail(input: { token: "verification-token" }) }');
  assert.equal(h.auth.revisionForTest(), before);
  assert.equal(h.stored(), saved);
});

test('authenticated requests attach private access token, variables and optional household header', async () => {
  const h = harness(() => Response.json({ data: { example: true } }));
  await h.login();
  assert.deepEqual(await h.auth.authenticatedGraphql(query, { id: 'one' }), { example: true });
  await h.auth.authenticatedGraphql(query, { id: 'two' }, 'household-id');
  assert.equal(h.calls[1].headers.Authorization, 'Bearer access-1');
  assert.equal(h.calls[1].headers['x-household-id'], undefined);
  assert.equal(h.calls[2].headers['x-household-id'], 'household-id');
  assert.deepEqual(h.calls[2].variables, { id: 'two' });
  assert.equal(h.auth.accessToken, undefined);
  assert.equal(h.auth.session, undefined);
});

for (const [label, rejection] of [['GraphQL', denied], ['HTTP', () => new Response('', { status: 401 })]]) {
  test(`${label} unauthorized refreshes once and retries with same document, variables and household`, async () => {
    const h = harness(call => {
      if (call.query === authOperations.refresh) return Response.json({ data: { refreshAccessToken: tokens(2) } });
      return call.headers.Authorization === 'Bearer access-1' ? rejection() : Response.json({ data: { example: true } });
    });
    await h.login();
    assert.deepEqual(await h.auth.authenticatedGraphql(query, { id: 'one' }, 'household-id'), { example: true });
    assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
    assert.equal(h.calls.length, 4);
    assert.deepEqual(h.calls[3].variables, h.calls[1].variables);
    assert.equal(h.calls[3].query, h.calls[1].query);
    assert.equal(h.calls[3].headers.Authorization, 'Bearer access-2');
    assert.equal(h.calls[3].headers['x-household-id'], 'household-id');
    assert.equal(h.calls[2].headers.Authorization, undefined);
    assert.equal(h.calls[2].headers['x-household-id'], undefined);
  });
}

test('near-expiry concurrent requests share proactive refresh', async () => {
  const gate = deferred();
  const h = harness(async call => {
    if (call.query === authOperations.refresh) { await gate.promise; return Response.json({ data: { refreshAccessToken: tokens(2) } }); }
    return Response.json({ data: { example: true } });
  });
  await h.login();
  h.advance(91000);
  const requests = [h.auth.authenticatedGraphql(query), h.auth.authenticatedGraphql(query)];
  gate.resolve();
  await Promise.all(requests);
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.ok(h.calls.filter(c => c.query === query).every(c => c.headers.Authorization === 'Bearer access-2'));
});

test('simultaneous rejected tokens share refresh, including a late unauthorized response', async () => {
  const bothDispatched = deferred(), releaseFirst = deferred(), releaseSecond = deferred();
  let originalRequests = 0;
  const h = harness(async call => {
    if (call.query === authOperations.refresh) return Response.json({ data: { refreshAccessToken: tokens(2) } });
    if (call.headers.Authorization === 'Bearer access-1') {
      originalRequests++;
      const gate = originalRequests === 1 ? releaseFirst : releaseSecond;
      if (originalRequests === 2) bothDispatched.resolve();
      await gate.promise;
      return denied();
    }
    return Response.json({ data: { example: true } });
  });
  await h.login();
  const first = h.auth.authenticatedGraphql(query);
  const second = h.auth.authenticatedGraphql(query);
  await bothDispatched.promise;
  releaseFirst.resolve();
  await first; // first rotation is already finished before the second 401 arrives.
  releaseSecond.resolve();
  await second;
  assert.equal(originalRequests, 2);
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.equal(h.calls.filter(c => c.query === query).length, 4);
});

test('requests rejected together and requests joining an in-flight refresh use one rotation', async () => {
  const bothDispatched = deferred(), rejectOriginals = deferred(), refreshStarted = deferred(), finishRefresh = deferred();
  let originalRequests = 0;
  const h = harness(async call => {
    if (call.query === authOperations.refresh) {
      refreshStarted.resolve();
      await finishRefresh.promise;
      return Response.json({ data: { refreshAccessToken: tokens(2) } });
    }
    if (call.headers.Authorization === 'Bearer access-1') {
      if (++originalRequests === 2) bothDispatched.resolve();
      await rejectOriginals.promise;
      return denied();
    }
    return Response.json({ data: { example: true } });
  });
  await h.login();
  const first = h.auth.authenticatedGraphql(query);
  const second = h.auth.authenticatedGraphql(query);
  await bothDispatched.promise;
  rejectOriginals.resolve();
  await refreshStarted.promise;
  const third = h.auth.authenticatedGraphql(query);
  finishRefresh.resolve();
  await Promise.all([first, second, third]);
  assert.equal(originalRequests, 2);
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.equal(h.calls.filter(c => c.query === query).length, 5);
});

test('concurrent refresh failure signs out every caller without another rotation', async () => {
  const bothDispatched = deferred(), release = deferred();
  let originalRequests = 0;
  const h = harness(async call => {
    if (call.query === authOperations.refresh) throw new Error('Offline during refresh');
    if (++originalRequests === 2) bothDispatched.resolve();
    await release.promise;
    return denied();
  });
  await h.login();
  const results = Promise.allSettled([h.auth.authenticatedGraphql(query), h.auth.authenticatedGraphql(query)]);
  await bothDispatched.promise;
  release.resolve();
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'NO_SESSION');
    assert.ok(isSignedOutError(result.reason));
  }
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.equal(h.stored(), null);
});

for (const proactive of [false, true]) {
  for (const failure of ['offline', 'invalid-refresh']) {
    test(`failed ${proactive ? 'proactive' : 'reactive'} refresh (${failure}) surfaces signed-out error without retrying refresh`, async () => {
      const h = harness(call => {
        if (call.query !== authOperations.refresh) return denied();
        if (failure === 'offline') throw new Error('Network unavailable');
        return Response.json({ errors: [{ message: 'Invalid refresh token', extensions: { code: 'INVALID_REFRESH_TOKEN' } }] });
      });
      await h.login();
      if (proactive) h.advance(121000);
      await assert.rejects(h.auth.authenticatedGraphql(query), error =>
        error.code === 'NO_SESSION' && isSignedOutError(error) && /sign in again/i.test(error.message));
      assert.equal(h.stored(), null);
      assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
      const count = h.calls.length;
      await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
      assert.equal(h.calls.length, count);
    });
  }
}

test('a second unauthorized response signs out without an infinite retry', async () => {
  const h = harness(call => call.query === authOperations.refresh
    ? Response.json({ data: { refreshAccessToken: tokens(2) } }) : denied());
  await h.login();
  await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.equal(h.calls.filter(c => c.query === query).length, 2);
  assert.equal(h.stored(), null);
});

test('proactively refreshed token rejected by server never triggers a second refresh', async () => {
  const h = harness(call => call.query === authOperations.refresh
    ? Response.json({ data: { refreshAccessToken: tokens(2) } }) : denied());
  await h.login();
  h.advance(121000);
  await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 1);
  assert.equal(h.calls.filter(c => c.query === query).length, 1);
});

test('forbidden and network failures propagate without refreshing or deleting the session', async () => {
  for (const failure of ['forbidden', 'offline']) {
    const h = harness(() => {
      if (failure === 'offline') throw new Error('Offline');
      return Response.json({ errors: [{ message: 'Not a member', extensions: { code: 'FORBIDDEN' } }] });
    });
    await h.login();
    await assert.rejects(h.auth.authenticatedGraphql(query));
    assert.ok(h.stored());
    assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 0);
  }
});

test('late unauthorized response cannot refresh/replay under a newly logged-in session', async () => {
  const started = deferred(), release = deferred();
  const h = harness(async () => { started.resolve(); await release.promise; return denied(); });
  await h.login();
  const request = h.auth.authenticatedGraphql(query);
  const rejection = assert.rejects(request, { code: 'NO_SESSION' });
  await started.promise;
  await h.login();
  release.resolve();
  await rejection;
  assert.equal(h.calls.filter(c => c.query === authOperations.refresh).length, 0);
  assert.ok(h.stored());
});

test('signed-out request makes no network calls', async () => {
  const h = harness(() => { throw new Error('Unexpected call'); });
  await assert.rejects(h.auth.authenticatedGraphql(query), { code: 'NO_SESSION' });
  assert.equal(h.calls.length, 0);
});

for (const count of [0, 1, 3]) {
  test(`myHouseholds returns ${count} memberships without selecting, creating or persisting`, async () => {
    const memberships = Array.from({ length: count }, (_, index) => ({
      household: { id: `household-${index}`, name: `Household ${index}`, timezone: 'Africa/Cairo' },
      joinedAt: '2026-10-29T00:00:00.000Z', role: index ? 'MEMBER' : 'OWNER',
    }));
    const h = harness(call => {
      assert.equal(call.query, myHouseholdsQuery);
      return Response.json({ data: { myHouseholds: memberships } });
    });
    await h.login();
    const saved = h.stored();
    assert.deepEqual(await loadMyHouseholds(h.auth), memberships);
    assert.equal(h.stored(), saved);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].headers.Authorization, 'Bearer access-1');
    assert.equal(h.calls[1].headers['x-household-id'], undefined);
  });
}

test('myHouseholds operation validates against the generated backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  assert.deepEqual(validate(schema, parse(myHouseholdsQuery)), []);
});
