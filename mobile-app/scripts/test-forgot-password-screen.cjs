const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
require.extensions['.ts'] = (module, file) => module._compile(transpile(fs.readFileSync(file, 'utf8')), file);
const { AuthStore } = require('../src/repositories/auth-store.ts');
const { BackendError } = require('../src/services/backend-core.ts');
const { authErrorKey } = require('../src/services/auth-validation.ts');
const resetService = require('../src/services/password-reset.ts');
const verificationService = require('../src/services/email-verification.ts');
const resetDomain = require('../src/domain/password-reset.ts');
const verificationDomain = require('../src/domain/email-verification.ts');
const authForm = require('../src/services/auth-form.ts');
const { authMessages } = require('../src/i18n/auth.ts');
const { passwordResetMessages: messages } = require('../src/i18n/password-reset.ts');
const email = 'test@example.invalid', newPassword = 'NewPassword1!', resetToken = 'reset-token-secret';
const profileRoute = { pathname: '/feature', params: { feature: 'profile' } };
const tick = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const refused = code => { throw new BackendError('Refused', undefined, [code]); };
const t = messages.en;
// Countdown intervals would keep the test process alive.
const opened = [];
test.afterEach(() => { for (const close of opened.splice(0)) close(); });

/** The real screen, auth store and password reset service; only native rendering, the router and the server are stand-ins. */
async function app({ language = 'en', canGoBack = true, server = {}, screen = 'forgot' } = {}) {
  const instances = new Map(), routes = [], calls = [];
  let current;
  const react = {
    useState(initial) {
      const self = current, i = self.cursor++;
      if (!(i in self.hooks)) self.hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [self.hooks[i], value => { self.hooks[i] = typeof value === 'function' ? value(self.hooks[i]) : value; }];
    },
    useRef: initial => react.useState(() => ({ current: initial }))[0],
    useEffect(effect, deps) {
      const self = current, i = self.cursor++, previous = self.hooks[i];
      if (previous && deps.every((d, n) => d === previous.deps[n])) return;
      self.hooks[i] = { deps, cleanup: previous?.cleanup };
      self.effects.push(() => { self.hooks[i].cleanup?.(); self.hooks[i].cleanup = effect(); });
    },
  };
  let signedIn = false;
  const store = new AuthStore(() => ({
    login: async input => { calls.push(['login', input]); await server.login?.(input); signedIn = true; },
    me: async () => { if (!signedIn) throw { code: 'NO_SESSION' }; return { id: 'user', email, name: 'Test', timezone: 'UTC', languageCode: language, emailVerifiedAt: new Date().toISOString() }; },
  }));
  await store.restore(); // signed out and ready, as at app start
  const graphql = async (query, { input }) => {
    const name = query === resetService.passwordResetOperations.verifyCode ? 'verifyPasswordResetCode' : 'requestPasswordReset';
    calls.push([name, input]);
    const answer = await server[name]?.(input);
    return { [name]: answer ?? (name === 'requestPasswordReset' ? true : { resetToken, expiresAt: new Date(Date.now() + 600_000).toISOString() }) };
  };
  const names = (...keys) => Object.fromEntries(keys.map(key => [key, key]));
  const element = (type, props) => ({ type, props });
  const mocks = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { ...names('View', 'Pressable', 'KeyboardAvoidingView'), Platform: { OS: 'ios' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: { canGoBack: () => canGoBack, back: () => routes.push('BACK'),
      ...Object.fromEntries(['push', 'replace', 'dismissTo'].map(kind => [kind, href => routes.push([kind, href])])) } },
    '@/providers/auth-provider': { useAuth: () => ({ ...store.getSnapshot(), login: store.login, loginWithResult: store.loginWithResult, restore: store.restore, logout: async () => {} }) },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) },
    '@/components/ui/core': names('AppText', 'Button', 'Card', 'PageHeader', 'Screen'),
    '@/components/ui/form-field': names('FormField'),
    '@/components/auth-ui': names('AuthShell', 'AuthInput', 'AuthAction', 'AuthNotice', 'AuthLink', 'AuthSocial'),
    '@/services/backend': { getBackend: () => ({ graphql }) },
    '@/services/auth': { getAuth: () => ({ resetPassword: async (token, password) => { calls.push(['resetPassword', { token, password }]); await server.resetPassword?.(token, password); } }) },
    '@/services/auth-validation': { authErrorKey }, '@/services/auth-form': authForm,
    '@/services/password-reset': resetService, '@/services/email-verification': verificationService,
    '@/domain/password-reset': resetDomain, '@/domain/email-verification': verificationDomain,
    '@/i18n/auth': { authMessages }, '@/i18n/password-reset': { passwordResetMessages: messages },
    './profile-screen': { __esModule: true, default: 'ProfileScreen' },
    './email-verification-screen': { EmailVerificationFlow: 'EmailVerificationFlow' },
  };
  const load = path => {
    const exports = {};
    // Any import not listed above, such as device storage, fails the test.
    new Function('require', 'exports', transpile(fs.readFileSync(path, 'utf8')))(id => { assert.ok(mocks[id], id); return mocks[id]; }, exports);
    return exports;
  };
  mocks['@/hooks/use-resend-wait'] = load('src/hooks/use-resend-wait.ts');
  const Forgot = load('src/screens/forgot-password-screen.tsx').default;
  const root = screen === 'login' ? load('src/screens/auth-screen.tsx').default : Forgot;
  function unmount(type) { for (const hook of instances.get(type).hooks) hook?.cleanup?.(); instances.delete(type); }
  function render() {
    const seen = new Set(), effects = [];
    const expand = node => {
      if (Array.isArray(node)) return node.flatMap(expand);
      if (!node || typeof node !== 'object') return [];
      if (typeof node.type !== 'function') return [node, ...expand(node.props?.children)];
      if (!instances.has(node.type)) instances.set(node.type, { hooks: [], effects: [] });
      const self = instances.get(node.type), outer = current;
      seen.add(node.type); self.cursor = 0; current = self;
      const output = node.type(node.props);
      current = outer;
      effects.push(...self.effects.splice(0));
      return expand(output);
    };
    const tree = expand({ type: root, props: {} });
    for (const type of [...instances.keys()]) if (!seen.has(type)) unmount(type);
    effects.forEach(effect => effect());
    return tree;
  }
  const find = label => render().find(n => n.props.label === label);
  const unmountAll = () => { for (const type of [...instances.keys()]) unmount(type); };
  opened.push(unmountAll);
  return { calls, routes, render, find, store, unmountAll,
    memory: () => instances.get(Forgot)?.hooks ?? [],
    shell: () => render().find(n => n.type === 'AuthShell').props,
    type: (label, value) => find(label).props.onChangeText(value),
    press: async label => { find(label).props.onPress(); await tick(); },
    notice: () => render().find(n => n.type === 'AuthNotice')?.props,
    texts: () => render().map(n => n.props.children).filter(c => typeof c === 'string') };
}
const named = (h, name) => h.calls.filter(call => call[0] === name).map(call => call[1]);
const holds = (h, secret) => h.memory().some(hook => JSON.stringify(hook ?? null)?.includes(secret));
async function toCode(options, address = email) {
  const h = await app(options);
  h.type(t.email, address); await h.press(t.sendCode);
  return h;
}
async function toPassword(options) {
  const h = await toCode(options);
  h.type(t.code, '012345'); await h.press(t.verifyCode);
  return h;
}
async function submitPassword(h, password = newPassword, confirmation = password) {
  h.type(t.newPassword, password); h.type(t.confirmPassword, confirmation); await h.press(t.savePassword);
}

test('step 1: a bad email sends nothing; a valid one is sent trimmed, moves to the code step and starts the wait', async ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-11-27T12:00:00Z') });
  const h = await app();
  assert.equal(h.shell().title, t.emailTitle);
  h.type(t.email, 'not-an-email'); await h.press(t.sendCode);
  assert.equal(h.find(t.email).props.error, t.emailInvalid);
  assert.equal(h.calls.length, 0);
  h.type(t.email, `  ${email} `);
  assert.equal(h.find(t.email).props.error, undefined);
  await h.press(t.sendCode);
  assert.deepEqual(named(h, 'requestPasswordReset'), [{ email }]);
  assert.equal(h.shell().title, t.codeTitle);
  assert.ok(h.texts().includes(t.sentTo(`⁦${email}⁩`)));
  assert.equal(h.find(t.resendIn(60)).props.disabled, true);
});

test('step 1: the email field reads left to right and failures stay on the step with their message', async () => {
  for (const [fail, reason] of [[() => refused('TOO_MANY_REQUESTS'), 'rateLimited'], [() => { throw new BackendError('Backend request failed.'); }, 'network'], [() => refused('INTERNAL'), 'error']]) {
    const h = await toCode({ server: { requestPasswordReset: fail } });
    assert.equal(h.shell().title, t.emailTitle);
    assert.equal(h.notice().children, t[reason]); assert.ok(!h.notice().success);
    assert.equal(h.find(t.email).props.ltr, true);
  }
});

test('step 2: the code field takes typed, pasted and Arabic digits, and a malformed code sends nothing', async () => {
  const h = await toCode();
  const field = h.find(t.code).props;
  assert.equal(field.code, true); assert.equal(field.keyboardType, 'number-pad'); assert.equal(field.autoComplete, 'one-time-code'); assert.equal(field.maxLength, undefined);
  for (const [typed, kept] of [['٠١٢٣٤٥', '012345'], ['۰۱۲۳۴۵', '012345'], [' 012 345\n', '012345'], ['0123456', '012345'], ['01a', '01']]) {
    h.type(t.code, typed); assert.equal(h.find(t.code).props.value, kept, typed);
  }
  await h.press(t.verifyCode);
  assert.equal(h.find(t.code).props.error, t.codeFormat);
  assert.equal(named(h, 'verifyPasswordResetCode').length, 0);
});

test('step 2: a wrong code shows the generic message; the right one moves on and keeps the token in component state only', async () => {
  let wrong = true;
  const h = await toCode({ server: { verifyPasswordResetCode: () => { if (wrong) refused('INVALID_PASSWORD_RESET_CODE'); } } });
  h.type(t.code, '111111'); await h.press(t.verifyCode);
  assert.equal(h.notice().children, t.invalidCode);
  wrong = false;
  h.type(t.code, '012345');
  assert.equal(h.notice(), undefined, 'the message clears on edit');
  await h.press(t.verifyCode);
  assert.deepEqual(named(h, 'verifyPasswordResetCode').at(-1), { email, code: '012345' });
  assert.equal(h.shell().title, t.passwordTitle);
  assert.ok(holds(h, resetToken));
  assert.equal(JSON.stringify(h.routes).includes(resetToken), false);
});

test('step 2: "Change email" returns to step 1; the same address within its wait goes back without another request', async () => {
  const h = await toCode();
  h.type(t.code, '01');
  await h.press(t.changeEmail);
  assert.equal(h.shell().title, t.emailTitle);
  assert.equal(h.find(t.email).props.value, email);
  await h.press(t.sendCode);
  assert.equal(h.shell().title, t.codeTitle);
  assert.equal(named(h, 'requestPasswordReset').length, 1);
  assert.equal(h.find(t.code).props.value, '', 'the code field was cleared');
  await h.press(t.changeEmail);
  h.type(t.email, 'other@example.invalid'); await h.press(t.sendCode);
  assert.deepEqual(named(h, 'requestPasswordReset').map(input => input.email), [email, 'other@example.invalid']);
});

test('step 2: resend waits 60 seconds, then sends again, clears the code and shows "requested"', async ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-11-27T12:00:00Z') });
  const h = await toCode();
  h.find(t.resendIn(60)).props.onPress(); await tick();
  assert.equal(named(h, 'requestPasswordReset').length, 1, 'nothing is sent during the wait');
  ctx.mock.timers.tick(15_000);
  assert.ok(h.find(t.resendIn(45)));
  ctx.mock.timers.tick(45_000);
  h.type(t.code, '123');
  await h.press(t.resend);
  assert.equal(named(h, 'requestPasswordReset').length, 2);
  assert.equal(h.find(t.code).props.value, '');
  assert.deepEqual([h.notice().children, h.notice().success], [t.requested, true]);
  assert.equal(h.find(t.resendIn(60)).props.disabled, true);
});

test('step 3: weak and mismatched passwords are refused on the device with the sign-up rules', async () => {
  const h = await toPassword();
  for (const weak of ['short1!', 'lowercase1!', 'NoNumber!', 'NoSymbol123']) {
    await submitPassword(h, weak);
    assert.equal(h.find(t.newPassword).props.error, t.weakPassword, weak);
  }
  await submitPassword(h, newPassword, 'Different1!');
  assert.equal(h.find(t.confirmPassword).props.error, t.passwordMismatch);
  assert.equal(named(h, 'resetPassword').length, 0);
  assert.equal(h.find(t.newPassword).props.password, true);
  assert.equal(h.find(t.confirmPassword).props.password, true);
});

test('step 3: a token past its usable time goes back to the code step with "expired", without a request', async ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-11-27T12:00:00Z') });
  const h = await toPassword();
  ctx.mock.timers.setTime(Date.parse('2026-11-27T12:00:00Z') + 600_000 - 15_000);
  await submitPassword(h);
  assert.equal(named(h, 'resetPassword').length, 0);
  assert.equal(h.shell().title, t.codeTitle);
  assert.equal(h.notice().children, t.expired);
  assert.equal(holds(h, resetToken), false);
  assert.equal(holds(h, newPassword), false);
});

test('step 3: the server saying "expired" also goes back to the code step; a weak password shows on the field', async () => {
  const expired = await toPassword({ server: { resetPassword: () => refused('INVALID_OR_EXPIRED_TOKEN') } });
  await submitPassword(expired);
  assert.equal(expired.shell().title, t.codeTitle);
  assert.equal(expired.notice().children, t.expired);
  assert.equal(holds(expired, resetToken), false);
  for (const code of ['WEAK_PASSWORD', 'BAD_REQUEST']) {
    const weak = await toPassword({ server: { resetPassword: () => refused(code) } });
    await submitPassword(weak);
    assert.equal(weak.shell().title, t.passwordTitle);
    assert.equal(weak.find(t.newPassword).props.error, t.weakPassword);
  }
  const offline = await toPassword({ server: { resetPassword: () => { throw new BackendError('Backend request failed.'); } } });
  await submitPassword(offline);
  assert.equal(offline.notice().children, t.network);
  assert.ok(holds(offline, resetToken), 'a network failure keeps the token for a retry');
});

test('success: resets with the token, logs in with the email and new password, opens Profile and forgets both secrets', async () => {
  const h = await toPassword();
  await submitPassword(h);
  assert.deepEqual(named(h, 'resetPassword'), [{ token: resetToken, password: newPassword }]);
  assert.deepEqual(named(h, 'login'), [{ identifier: email, password: newPassword }]);
  assert.deepEqual(h.routes, [['replace', profileRoute]]);
  assert.equal(holds(h, resetToken), false);
  assert.equal(holds(h, newPassword), false);
  assert.equal(JSON.stringify(h.routes).includes(newPassword), false);
});

test('if logging in afterwards fails, it says the password was updated and offers "Log in"', async () => {
  const h = await toPassword({ server: { login: () => refused('INVALID_CREDENTIALS') } });
  await submitPassword(h);
  assert.equal(named(h, 'resetPassword').length, 1);
  assert.equal(h.shell().title, t.done);
  assert.deepEqual([h.notice().children, h.notice().success], [t.doneLogin, true]);
  assert.equal(holds(h, newPassword), false);
  await h.press(t.login);
  assert.deepEqual(h.routes, [['dismissTo', '/login']]);
});

test('Back: password to code (forgetting the token), code to email, email leaves; nothing while a request runs', async () => {
  const h = await toPassword();
  h.type(t.newPassword, newPassword);
  h.shell().onBack();
  assert.equal(h.shell().title, t.codeTitle);
  assert.equal(holds(h, resetToken), false); assert.equal(holds(h, newPassword), false);
  h.shell().onBack();
  assert.equal(h.shell().title, t.emailTitle);
  h.shell().onBack();
  assert.deepEqual(h.routes, ['BACK']);
  const alone = await app({ canGoBack: false });
  alone.shell().onBack();
  assert.deepEqual(alone.routes, [['replace', '/login']]);

  let finish;
  const busy = await app({ server: { requestPasswordReset: () => new Promise(resolve => { finish = resolve; }) } });
  busy.type(t.email, email); busy.find(t.sendCode).props.onPress(); await tick();
  busy.shell().onBack();
  assert.deepEqual(busy.routes, []);
  finish(true); await tick();
  assert.equal(busy.shell().title, t.codeTitle);
});

test('one request at a time, and nothing happens after the screen is gone', async () => {
  let finish;
  const h = await toPassword({ server: { resetPassword: () => new Promise(resolve => { finish = resolve; }) } });
  h.type(t.newPassword, newPassword); h.type(t.confirmPassword, newPassword);
  const save = h.find(t.savePassword).props;
  save.onPress(); save.onPress(); await tick();
  assert.equal(named(h, 'resetPassword').length, 1);
  assert.equal(h.find(t.saving).props.busy, true);
  h.unmountAll();
  finish(); await tick();
  assert.equal(named(h, 'login').length, 0, 'no login after leaving');
  assert.deepEqual(h.routes, []);
});

test('Arabic: Arabic copy on every step, the email isolated left to right, and the code field left to right', async () => {
  const ar = messages.ar;
  const h = await app({ language: 'ar' });
  assert.equal(h.shell().title, ar.emailTitle);
  assert.equal(h.find(ar.email).props.ltr, true);
  h.type(ar.email, email); await h.press(ar.sendCode);
  assert.ok(h.texts().includes(ar.sentTo(`⁦${email}⁩`)));
  assert.equal(h.find(ar.code).props.code, true);
  for (const label of [ar.changeEmail, ar.verifyCode, ar.code]) assert.ok(h.find(label), label);
  h.type(ar.code, '٠١٢٣٤٥'); await h.press(ar.verifyCode);
  assert.deepEqual(named(h, 'verifyPasswordResetCode').at(-1).code, '012345');
  assert.equal(h.shell().title, ar.passwordTitle);
  for (const label of [ar.newPassword, ar.confirmPassword, ar.savePassword]) assert.ok(h.find(label), label);
  for (const text of [h.shell().title, h.shell().subtitle]) assert.match(text, /[؀-ۿ]/u);
});

test('the login screen\'s "Forgot password?" opens /forgot-password, which is this screen; the emailed reset link screen is unchanged', async () => {
  const h = await app({ screen: 'login' });
  await h.press(authMessages.en.forgotPassword);
  assert.deepEqual(h.routes, [['push', '/forgot-password']]);
  assert.match(fs.readFileSync('src/app/forgot-password.tsx', 'utf8'), /export \{ default \} from '@\/screens\/forgot-password-screen'/);
  assert.match(fs.readFileSync('src/app/reset-password.tsx', 'utf8'), /export \{ default \} from '@\/screens\/password-reset-screen'/);
});
