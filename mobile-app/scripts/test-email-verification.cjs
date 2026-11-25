const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createBackendClient } = require('../src/services/backend-core.ts');
const { createEmailVerificationService, emailVerificationOperations } = require('../src/services/email-verification.ts');
const { normalizeEmailCode, parseEmailCode, resendDeadline, resendSecondsLeft, RESEND_COOLDOWN_MS } = require('../src/domain/email-verification.ts');
const { emailVerificationMessages } = require('../src/i18n/email-verification.ts');
const email = 'test@example.invalid';
const graphqlError = code => Response.json({ errors: [{ message: 'Refused', ...(code ? { extensions: { code } } : {}) }], data: null });

function harness(respond) {
  const calls = [];
  const client = createBackendClient('https://api.example.invalid', async (url, init) => {
    calls.push({ url, ...JSON.parse(init.body), headers: init.headers });
    return respond();
  });
  return { calls, service: createEmailVerificationService(client) };
}
const actions = { request: s => s.requestEmailVerificationCode(email), verify: s => s.verifyEmailCode(email, '012345') };

test('both documents validate against the actual generated backend schema', () => {
  const { buildSchema, parse, validate } = require('../../backend/node_modules/graphql');
  const schema = buildSchema(fs.readFileSync('../backend/schema.graphql', 'utf8'));
  for (const operation of Object.values(emailVerificationOperations)) assert.deepEqual(validate(schema, parse(operation)), []);
});

test('requests are public, trim the email, and send the code as a string with its leading zero', async () => {
  const request = harness(() => Response.json({ data: { requestEmailVerificationCode: true } }));
  assert.deepEqual(await request.service.requestEmailVerificationCode(` ${email} `), { ok: true });
  assert.equal(request.calls[0].query, emailVerificationOperations.requestCode);
  assert.deepEqual(request.calls[0].variables, { input: { email } });
  const verify = harness(() => Response.json({ data: { verifyEmailCode: true } }));
  assert.deepEqual(await verify.service.verifyEmailCode(` ${email} `, '٠١٢٣٤٥'), { ok: true });
  assert.equal(verify.calls[0].query, emailVerificationOperations.verifyCode);
  assert.deepEqual(verify.calls[0].variables, { input: { email, code: '012345' } });
  for (const call of [...request.calls, ...verify.calls]) {
    assert.equal(call.url, 'https://api.example.invalid/graphql');
    assert.equal(call.headers.Authorization, undefined);
    assert.equal(call.headers['x-household-id'], undefined);
  }
});

test('a malformed code is refused without a request', async () => {
  const h = harness(() => assert.fail('unexpected API call'));
  for (const code of ['', '12345', '1234567', '12a456', '12345٫']) assert.deepEqual(await h.service.verifyEmailCode(email, code), { ok: false, reason: 'invalidCode' });
  assert.equal(h.calls.length, 0);
});

test('an invalid code, rate limit and unreachable server give distinct results, each from one request', async () => {
  const invalid = harness(() => graphqlError('INVALID_EMAIL_VERIFICATION_CODE'));
  assert.deepEqual(await actions.verify(invalid.service), { ok: false, reason: 'invalidCode' });
  for (const act of Object.values(actions)) {
    for (const [respond, reason] of [
      [() => graphqlError('TOO_MANY_REQUESTS'), 'rateLimited'],
      [() => new Response('', { status: 429 }), 'rateLimited'],
      [() => { throw new TypeError('Network request failed'); }, 'network'],
      [() => new Response('', { status: 503 }), 'network'],
      [() => graphqlError('BAD_REQUEST'), 'error'],
      [() => graphqlError('INTERNAL'), 'error'],
      [() => new Response('', { status: 400 }), 'error'],
      [() => Response.json({ data: { requestEmailVerificationCode: false, verifyEmailCode: false } }), 'error'],
    ]) {
      const h = harness(respond);
      assert.deepEqual(await act(h.service), { ok: false, reason });
      assert.equal(h.calls.length, 1, 'nothing is retried automatically');
    }
  }
});

test('an error that did not come from the backend client is never reported as a network problem', async () => {
  const service = createEmailVerificationService({ graphql: async () => { throw new Error('bug'); } });
  for (const act of Object.values(actions)) assert.deepEqual(await act(service), { ok: false, reason: 'error' });
});

test('Arabic-Indic, Persian and mixed digits normalize to ASCII and keep leading zeros', () => {
  for (const text of ['001234', '٠٠١٢٣٤', '۰۰۱۲۳۴', '٠۰1۲٣4', ' 001 234\n', '‏001234‎', '⁧٠٠١٢٣٤⁩']) assert.equal(parseEmailCode(text), '001234', JSON.stringify(text));
  assert.equal(normalizeEmailCode('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeEmailCode('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeEmailCode('٠١'), '01', 'partial input normalizes while typing');
  assert.equal(parseEmailCode('000000'), '000000');
});

test('only exactly six digits are a code', () => {
  for (const text of ['', '      ', '12345', '1234567', '12345a', '-12345', '1.2345', '123-456', '１２３４５６', '१२३४५६', '1e5000']) assert.equal(parseEmailCode(text), null, text);
});

test('the resend wait follows an absolute 60-second deadline, so time spent in the background counts', () => {
  const start = 1_000_000, deadline = resendDeadline(start);
  assert.equal(RESEND_COOLDOWN_MS, 60_000);
  assert.equal(deadline, start + 60_000);
  for (const [elapsed, left] of [[0, 60], [1, 60], [1000, 59], [59_000, 1], [59_999, 1], [60_000, 0], [3_600_000, 0]]) assert.equal(resendSecondsLeft(deadline, start + elapsed), left, String(elapsed));
  assert.equal(resendSecondsLeft(deadline, start - 3_600_000), 60, 'a clock set back never shows more than one cooldown');
  for (const none of [null, NaN, Infinity]) assert.equal(resendSecondsLeft(none, start), 0);
});

test('English and Arabic strings have the same keys and shapes and cover every failure reason', () => {
  const { en, ar } = emailVerificationMessages;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  const text = message => typeof message === 'function' ? message(5) : message;
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], typeof ar[key], key);
    assert.ok(text(en[key]).trim(), key);
    assert.doesNotMatch(text(en[key]), /[؀-ۿ]/u, key);
    assert.match(text(ar[key]), /[؀-ۿ]/u, key);
  }
  for (const reason of ['invalidCode', 'rateLimited', 'network', 'error']) { assert.ok(en[reason]); assert.ok(ar[reason]); }
  for (const t of [en, ar]) {
    assert.match(t.resendIn(60), /1:00$/); assert.match(t.resendIn(5), /0:05$/);
    assert.ok(t.sentTo(email).includes(email));
  }
});
