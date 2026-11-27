const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(transpile(fs.readFileSync(filename, 'utf8')), filename);
const { createBackendClient, BackendError } = require('../src/services/backend-core.ts');
const { createAuthService } = require('../src/services/auth-service.ts');
const { createPasswordResetService, passwordResetOperations, resetFailure } = require('../src/services/password-reset.ts');
const domain = require('../src/domain/password-reset.ts');
const verificationDomain = require('../src/domain/email-verification.ts');
const { passwordResetMessages } = require('../src/i18n/password-reset.ts');
const email = 'test@example.invalid';
const graphqlError = code => Response.json({ errors: [{ message: 'Refused', ...(code ? { extensions: { code } } : {}) }], data: null });

function harness(respond, auth = { resetPassword: async () => {} }) {
  const calls = [];
  const client = createBackendClient('https://api.example.invalid', async (url, init) => {
    calls.push({ url, ...JSON.parse(init.body), headers: init.headers });
    return respond();
  });
  return { calls, service: createPasswordResetService(client, auth) };
}
const failures = [
  [() => graphqlError('TOO_MANY_REQUESTS'), 'rateLimited'],
  [() => new Response('', { status: 429 }), 'rateLimited'],
  [() => { throw new TypeError('Network request failed'); }, 'network'],
  [() => new Response('', { status: 503 }), 'network'],
  [() => graphqlError('INTERNAL'), 'error'],
  [() => new Response('', { status: 400 }), 'error'],
];

test('the three documents validate against the generated backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const operation of Object.values(passwordResetOperations)) assert.deepEqual(validate(schema, parse(operation)), []);
});

test('requests are public: no session or household is ever sent', async () => {
  const h = harness(() => Response.json({ data: { requestPasswordReset: true, verifyPasswordResetCode: { resetToken: 't', expiresAt: '2026-11-27T12:10:00.000Z' } } }));
  await h.service.requestPasswordReset(email);
  await h.service.verifyPasswordResetCode(email, '012345');
  for (const call of h.calls) {
    assert.equal(call.url, 'https://api.example.invalid/graphql');
    assert.equal(call.headers.Authorization, undefined);
    assert.equal(call.headers['x-household-id'], undefined);
  }
});

test('requestPasswordReset trims the email and treats acceptance as success', async () => {
  const h = harness(() => Response.json({ data: { requestPasswordReset: true } }));
  assert.deepEqual(await h.service.requestPasswordReset(`  ${email} `), { ok: true });
  assert.equal(h.calls[0].query, passwordResetOperations.request);
  assert.deepEqual(h.calls[0].variables, { input: { email } });
});

test('requestPasswordReset maps rate limit, network and other failures, each from one request', async () => {
  for (const [respond, reason] of [...failures, [() => graphqlError('BAD_REQUEST'), 'error'], [() => Response.json({ data: { requestPasswordReset: false } }), 'error']]) {
    const h = harness(respond);
    assert.deepEqual(await h.service.requestPasswordReset(email), { ok: false, reason });
    assert.equal(h.calls.length, 1);
  }
});

test('verifyPasswordResetCode sends the code as six ASCII digits and returns the token with its expiry in milliseconds', async () => {
  const h = harness(() => Response.json({ data: { verifyPasswordResetCode: { resetToken: 'reset-token', expiresAt: '2026-11-27T12:10:00.000Z' } } }));
  assert.deepEqual(await h.service.verifyPasswordResetCode(` ${email} `, '٠١٢٣٤٥'), { ok: true, resetToken: 'reset-token', expiresAt: Date.parse('2026-11-27T12:10:00.000Z') });
  assert.equal(h.calls[0].query, passwordResetOperations.verifyCode);
  assert.deepEqual(h.calls[0].variables, { input: { email, code: '012345' } });
});

test('verifyPasswordResetCode refuses a malformed code without a request', async () => {
  const h = harness(() => assert.fail('unexpected API call'));
  for (const code of ['', '12345', '1234567', '12a456', '012-345x']) assert.deepEqual(await h.service.verifyPasswordResetCode(email, code), { ok: false, reason: 'invalidCode' });
  assert.equal(h.calls.length, 0);
});

test('verifyPasswordResetCode maps the generic code error, rate limit, network and other failures', async () => {
  for (const [respond, reason] of [[() => graphqlError('INVALID_PASSWORD_RESET_CODE'), 'invalidCode'], ...failures,
    [() => Response.json({ data: { verifyPasswordResetCode: { resetToken: '', expiresAt: '2026-11-27T12:10:00.000Z' } } }), 'error'],
    [() => Response.json({ data: { verifyPasswordResetCode: { resetToken: 't', expiresAt: 'not a date' } } }), 'error']]) {
    const h = harness(respond);
    assert.deepEqual(await h.service.verifyPasswordResetCode(email, '012345'), { ok: false, reason });
    assert.equal(h.calls.length, 1, 'nothing is retried automatically');
  }
});

test('resetPassword goes through the auth service and maps expired tokens, weak passwords and other failures', async () => {
  const seen = [];
  const ok = harness(() => assert.fail('no direct request'), { resetPassword: async (token, password) => { seen.push([token, password]); } });
  assert.deepEqual(await ok.service.resetPassword('reset-token', 'NewPassword1!'), { ok: true });
  assert.deepEqual(seen, [['reset-token', 'NewPassword1!']]);
  for (const [error, reason] of [
    [new BackendError('Expired', undefined, ['INVALID_OR_EXPIRED_TOKEN']), 'expired'],
    [new BackendError('Weak', undefined, ['WEAK_PASSWORD']), 'weakPassword'],
    [new BackendError('Bad input', undefined, ['BAD_REQUEST']), 'weakPassword'],
    [new BackendError('Too many', undefined, ['TOO_MANY_REQUESTS']), 'rateLimited'],
    [new BackendError('Backend request failed.'), 'network'],
    [new BackendError('Backend HTTP 502', 502), 'network'],
    [new BackendError('Internal', undefined, ['INTERNAL']), 'error'],
    [new Error('bug'), 'error'],
  ]) {
    const h = harness(() => assert.fail('no direct request'), { resetPassword: async () => { throw error; } });
    assert.deepEqual(await h.service.resetPassword('reset-token', 'NewPassword1!'), { ok: false, reason });
    assert.equal(resetFailure(error), reason);
  }
});

test('with the real auth service, a successful reset sends no session and clears the one saved on this device', async () => {
  let stored = JSON.stringify({ version: 1, backendUrl: 'https://api.example.invalid', session: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 600_000 }, user: null });
  const calls = [];
  const client = createBackendClient('https://api.example.invalid', async (_url, init) => { calls.push({ ...JSON.parse(init.body), headers: init.headers }); return Response.json({ data: { resetPassword: true } }); });
  const auth = createAuthService(client, { read: async () => stored, write: async value => { stored = value; }, clear: async () => { stored = null; } }, 'https://api.example.invalid');
  const service = createPasswordResetService(client, auth);
  assert.deepEqual(await service.resetPassword('reset-token', 'NewPassword1!'), { ok: true });
  assert.equal(calls[0].query, passwordResetOperations.reset);
  assert.deepEqual(calls[0].variables, { input: { token: 'reset-token', newPassword: 'NewPassword1!' } });
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(stored, null);
});

test('domain helpers: email normalization, code input, code parsing', () => {
  assert.equal(domain.normalizeResetEmail('  Test@Example.INVALID '), email);
  for (const [typed, kept] of [['٠١٢٣٤٥', '012345'], ['۰۱۲۳۴۵', '012345'], [' 012 345\n', '012345'], ['‏012345', '012345'], ['012-345', '012345'], ['0123456', '012345'], ['01a', '01'], ['', '']]) {
    assert.equal(domain.toResetCodeInput(typed), kept, typed);
  }
  assert.equal(domain.parseResetCode('٠٠١٢٣٤'), '001234');
  assert.equal(domain.parseResetCode('12345'), null);
  assert.equal(domain.parseResetCode('12a456'), null);
  // One shared implementation with email verification.
  assert.equal(domain.toResetCodeInput, verificationDomain.toCodeInput);
});

test('a reset token counts as usable only until 15 seconds before it expires', () => {
  const now = 1_000_000;
  assert.equal(domain.RESET_TOKEN_MARGIN_MS, 15_000);
  assert.equal(domain.isResetTokenUsable(now + 600_000, now), true);
  assert.equal(domain.isResetTokenUsable(now + 15_001, now), true);
  assert.equal(domain.isResetTokenUsable(now + 15_000, now), false);
  assert.equal(domain.isResetTokenUsable(now - 1, now), false);
  for (const none of [null, NaN, Infinity]) assert.equal(domain.isResetTokenUsable(none, now), false);
});

/** Renders the hook with a minimal React: state, effects with cleanup, and re-render on demand. */
function renderHook(address, startNow) {
  const hooks = []; let cursor = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useEffect(effect, deps) {
      const i = cursor++; const previous = hooks[i];
      if (previous && deps.every((d, n) => d === previous.deps[n])) return;
      previous?.cleanup?.();
      hooks[i] = { deps, cleanup: effect() };
    },
  };
  const exports = {};
  new Function('require', 'exports', transpile(fs.readFileSync('src/hooks/use-resend-wait.ts', 'utf8')))(id => {
    if (id === 'react') return react;
    if (id === '@/domain/email-verification') return verificationDomain;
    assert.fail(id);
  }, exports);
  let current = { address, startNow };
  const render = (next = {}) => { current = { ...current, ...next }; cursor = 0; return exports.useResendWait(current.address, current.startNow); };
  return { render, unmount: () => hooks.forEach(hook => hook?.cleanup?.()) };
}

test('use-resend-wait: nothing to wait for until a code is sent; then 60 seconds from an absolute deadline', ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const h = renderHook(email, false);
  let state = h.render();
  assert.deepEqual([state.sent, state.waiting, state.secondsLeft], [false, false, 0]);
  state.start();
  state = h.render();
  assert.deepEqual([state.sent, state.waiting, state.secondsLeft], [true, true, 60]);
  ctx.mock.timers.tick(15_000);
  assert.equal(h.render().secondsLeft, 45);
  // In the background timers stop but time passes: the first tick afterwards catches up.
  ctx.mock.timers.setTime(1_000_000 + 59_000); ctx.mock.timers.tick(500);
  assert.equal(h.render().secondsLeft, 1);
  ctx.mock.timers.tick(500);
  state = h.render();
  assert.deepEqual([state.sent, state.waiting, state.secondsLeft], [true, false, 0]);
  h.unmount();
});

test('use-resend-wait: startNow waits at once; the wait belongs to one address, in any letter case', ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const h = renderHook(email, true);
  assert.equal(h.render().secondsLeft, 60);
  assert.equal(h.render({ address: ` ${email.toUpperCase()} ` }).secondsLeft, 60);
  const other = h.render({ address: 'other@example.invalid' });
  assert.deepEqual([other.waiting, other.secondsLeft, other.sent], [false, 0, true]);
  other.start();
  assert.equal(h.render().secondsLeft, 60);
  assert.equal(h.render({ address: email }).secondsLeft, 0, 'starting for another address replaces the wait');
  h.unmount();
});

test('use-resend-wait: the interval runs only while waiting and is cleared afterwards and on unmount', ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const realClear = globalThis.clearInterval; let cleared = 0;
  globalThis.clearInterval = id => { cleared++; return realClear(id); };
  try {
    const h = renderHook(email, true);
    h.render();
    ctx.mock.timers.tick(60_000); h.render();
    assert.equal(cleared, 1, 'cleared when the wait ends');
    h.render().start(); h.render(); h.unmount();
    assert.equal(cleared, 2, 'cleared on unmount');
  } finally { globalThis.clearInterval = realClear; }
});

test('strings: English and Arabic have the same keys and shapes, cover every failure, and use the app’s Arabic word for password', () => {
  const { en, ar } = passwordResetMessages;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  const text = message => typeof message === 'function' ? message(5) : message;
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], typeof ar[key], key);
    assert.ok(text(en[key]).trim(), key);
    assert.doesNotMatch(text(en[key]), /[؀-ۿ]/u, key);
    assert.match(text(ar[key]), /[؀-ۿ]/u, key);
  }
  for (const reason of ['invalidCode', 'expired', 'weakPassword', 'rateLimited', 'network', 'error']) { assert.ok(en[reason], reason); assert.ok(ar[reason], reason); }
  const arabic = Object.values(ar).map(text).join(' ');
  assert.match(arabic, /كلمة المرور/);
  assert.doesNotMatch(arabic, /كلمة السر/);
  for (const t of [en, ar]) {
    assert.match(t.resendIn(60), /1:00$/); assert.match(t.resendIn(5), /0:05$/);
    assert.ok(t.sentTo(email).includes(email));
  }
});
