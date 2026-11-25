const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
require.extensions['.ts'] = (module, file) => module._compile(transpile(fs.readFileSync(file, 'utf8')), file);
const { AuthStore } = require('../src/repositories/auth-store.ts');
const { BackendError } = require('../src/services/backend-core.ts');
const { authErrorKey } = require('../src/services/auth-validation.ts');
const verification = require('../src/services/email-verification.ts');
const domain = require('../src/domain/email-verification.ts');
const authForm = require('../src/services/auth-form.ts');
const { authMessages } = require('../src/i18n/auth.ts');
const { emailVerificationMessages: messages } = require('../src/i18n/email-verification.ts');
const email = 'test@example.invalid', password = 'Test-password1!';
const profileRoute = { pathname: '/feature', params: { feature: 'profile' } };
const draft = { name: 'Test User', username: 'test_user', email, phoneNumber: '01012345678', password, confirmPassword: password };
const account = { id: 'test-user', name: 'Test User', email, timezone: 'Africa/Cairo', languageCode: 'en', emailVerifiedAt: null };
const tick = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const refused = code => { throw new BackendError('Refused', undefined, [code]); };
// Countdown intervals would keep the test process alive.
const opened = [];
test.afterEach(() => { for (const close of opened.splice(0)) close(); });

/** Runs the real screens, auth store and verification service; only native rendering, the router and the server are stand-ins. */
async function app({ screen = 'verify', language = 'en', params = {}, canGoBack = true, server = {}, signedIn = null } = {}) {
  const instances = new Map(), routes = [], calls = [];
  let current, user = signedIn;
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
  const store = new AuthStore(() => ({
    login: async input => { calls.push(['login', input]); await server.login?.(input); user = user ?? account; },
    me: async () => { calls.push(['me']); if (!user) throw { code: 'NO_SESSION' }; return server.me ? server.me() : user; },
  }));
  await store.restore(); calls.length = 0;
  const graphql = async (query, { input }) => {
    const name = query === verification.emailVerificationOperations.verifyCode ? 'verifyEmailCode' : 'requestEmailVerificationCode';
    calls.push([name, input]);
    return { [name]: (await server[name]?.(input)) ?? true };
  };
  const names = (...keys) => Object.fromEntries(keys.map(key => [key, key]));
  const element = (type, props) => ({ type, props });
  const mocks = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { ...names('View', 'Pressable', 'Alert'), Platform: { OS: 'ios' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useLocalSearchParams: () => params, router: { canGoBack: () => canGoBack, back: () => routes.push('BACK'),
      ...Object.fromEntries(['push', 'replace', 'dismissTo'].map(kind => [kind, href => routes.push([kind, href])])) } },
    '@/providers/auth-provider': { useAuth: () => ({ ...store.getSnapshot(), login: store.login, loginWithResult: store.loginWithResult, restore: store.restore, logout: async () => {} }) },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) },
    '@/components/ui/core': names('AppText', 'Button', 'Card', 'PageHeader', 'Screen'),
    '@/components/ui/form-field': names('FormField'),
    '@/components/auth-ui': names('AuthShell', 'AuthInput', 'AuthAction', 'AuthNotice', 'AuthLink', 'AuthSocial'),
    '@/services/backend': { getBackend: () => { if (server.misconfigured) throw new Error('Set EXPO_PUBLIC_API_URL'); return { graphql }; } },
    '@/services/auth': { getAuth: () => ({ register: async input => { calls.push(['register', input]); await server.register?.(); return { userId: 'test-user' }; } }) },
    '@/services/feedback': require('./native-ui-fixture.cjs').fixtureModule('@/services/feedback'),
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => true },
    '@/services/auth-validation': { authErrorKey }, '@/services/auth-form': authForm, '@/services/email-verification': verification,
    '@/domain/email-verification': domain, '@/i18n/auth': { authMessages }, '@/i18n/email-verification': { emailVerificationMessages: messages },
  };
  const load = path => {
    const exports = {};
    // Any import not listed above, such as device storage, fails the test.
    new Function('require', 'exports', transpile(fs.readFileSync(path, 'utf8')))(id => { assert.ok(mocks[id], id); return mocks[id]; }, exports);
    return exports;
  };
  const verify = mocks['./email-verification-screen'] = load('src/screens/email-verification-screen.tsx');
  const profile = mocks['./profile-screen'] = { __esModule: true, ...load('src/screens/profile-screen.tsx') };
  const auth = load('src/screens/auth-screen.tsx').default;
  const root = { verify: verify.default, profile: profile.default, login: auth, signup: auth }[screen];
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
    const tree = expand({ type: root, props: screen === 'signup' ? { signup: true } : {} });
    for (const type of [...instances.keys()]) if (!seen.has(type)) unmount(type);
    effects.forEach(effect => effect());
    return tree;
  }
  const find = label => render().find(n => n.props.label === label);
  const unmountAll = () => { for (const type of [...instances.keys()]) unmount(type); };
  opened.push(unmountAll);
  return { calls, routes, render, find, store, unmountAll, auth, flow: verify.EmailVerificationFlow,
    memory: type => instances.get(type)?.hooks ?? [],
    type: (label, value) => find(label).props.onChangeText(value),
    press: async label => { find(label).props.onPress(); await tick(); },
    texts: () => render().map(n => n.props.children).filter(c => typeof c === 'string') };
}
const t = messages.en;
async function signUp(options) {
  const h = await app({ screen: 'signup', ...options });
  h.render();
  for (const [key, value] of Object.entries(draft)) h.type(authMessages.en[key], value);
  await h.press(authMessages.en.signup);
  return h;
}
async function enter(h, code = '012345', language = 'en') {
  h.type(messages[language].code, code);
  await h.press(messages[language].verify);
}
const named = (h, name) => h.calls.filter(call => call[0] === name).map(call => call[1]);
// The password may be held in one ref and nowhere else.
const holders = (h, types) => types.flatMap(type => h.memory(type)).filter(hook => JSON.stringify(hook ?? null)?.includes(password));

test('sign-up goes straight to the code, and verifying signs in with the password kept only in the mounted flow', async () => {
  const h = await signUp();
  assert.ok(h.texts().includes(t.sentTo(email)));
  assert.equal(h.find(t.email), undefined, 'a known email is not asked for again');
  assert.deepEqual(h.routes, [], 'the flow stays mounted, so nothing travels through the router');
  assert.equal(holders(h, [h.auth]).length, 1);
  assert.deepEqual(holders(h, [h.flow]), []);
  await enter(h);
  assert.deepEqual(named(h, 'verifyEmailCode'), [{ email, code: '012345' }]);
  assert.deepEqual(named(h, 'login'), [{ identifier: email, password }]);
  assert.deepEqual(h.routes, [['replace', profileRoute]]);
  assert.deepEqual(holders(h, [h.auth, h.flow]), []);
  assert.equal(JSON.stringify(h.routes).includes(password), false);
});

test('a wrong code keeps the password for the next try; success forgets it even when signing in fails', async () => {
  let wrong = true;
  const h = await signUp({ server: { verifyEmailCode: () => { if (wrong) refused('INVALID_EMAIL_VERIFICATION_CODE'); }, login: () => { throw new BackendError('Backend request failed.'); } } });
  await enter(h);
  assert.ok(h.texts().includes(t.invalidCode));
  assert.equal(named(h, 'login').length, 0);
  assert.equal(holders(h, [h.auth]).length, 1);
  wrong = false;
  await enter(h, '654321');
  assert.equal(named(h, 'login').length, 1);
  assert.ok(h.texts().includes(t.verified));
  assert.deepEqual(holders(h, [h.auth, h.flow]), []);
  await h.press(authMessages.en.login);
  assert.deepEqual(h.routes, [['dismissTo', '/login']]);
});

test('cancelling sign-up verification forgets the password and goes to login', async () => {
  for (const cancel of [h => h.find(t.backToLogin).props.onPress(), h => h.render().find(n => n.type === 'AuthShell').props.onBack()]) {
    const h = await signUp();
    cancel(h);
    assert.deepEqual(holders(h, [h.auth, h.flow]), []);
    assert.deepEqual(h.routes, [['dismissTo', '/login']]);
    assert.equal(named(h, 'login').length, 0);
  }
});

test('unmounting forgets the password, and a verification that finishes later neither signs in nor navigates', async () => {
  let finish;
  const h = await signUp({ server: { verifyEmailCode: () => new Promise(resolve => { finish = resolve; }) } });
  h.type(t.code, '012345'); h.find(t.verify).props.onPress(); await tick();
  const hooks = h.memory(h.auth);
  h.unmountAll();
  assert.equal(hooks.some(hook => JSON.stringify(hook ?? null)?.includes(password)), false);
  finish(true); await tick();
  assert.equal(named(h, 'login').length, 0);
  assert.deepEqual(h.routes, []);
});

test('a registration that finishes after leaving the screen never stores the password', async () => {
  let finish;
  const h = await app({ screen: 'signup', server: { register: () => new Promise(resolve => { finish = resolve; }) } });
  h.render();
  for (const [key, value] of Object.entries(draft)) h.type(authMessages.en[key], value);
  h.find(authMessages.en.signup).props.onPress(); await tick();
  const hooks = h.memory(h.auth);
  h.unmountAll(); finish(); await tick();
  assert.equal(hooks.some(hook => JSON.stringify(hook ?? null)?.includes(password)), false);
});

test('a failed registration stays on the form and stores nothing', async () => {
  const h = await signUp({ server: { register: () => refused('USERNAME_TAKEN') } });
  assert.ok(h.texts().includes(authMessages.en.usernameTaken));
  assert.equal(h.find(t.code), undefined);
  assert.deepEqual(holders(h, [h.auth]), []);
});

test('a login refused for an unverified email opens the screen with the email, or without it for a username', async () => {
  for (const [identifier, expected] of [[` ${email} `, { pathname: '/verify-email-code', params: { email } }], ['test_user', '/verify-email-code']]) {
    const h = await app({ screen: 'login', server: { login: () => refused('EMAIL_NOT_VERIFIED') } });
    h.type(authMessages.en.identifier, identifier); h.type(authMessages.en.password, password);
    await h.press(authMessages.en.login);
    assert.deepEqual(h.routes, [['push', expected]]);
    assert.equal(JSON.stringify(h.routes).includes(password), false);
    assert.deepEqual(holders(h, [h.auth]), [], 'a login password is not kept');
  }
});

test('other login failures stay on the form', async () => {
  for (const code of ['INVALID_CREDENTIALS', 'TOO_MANY_REQUESTS']) {
    const h = await app({ screen: 'login', server: { login: () => refused(code) } });
    h.type(authMessages.en.identifier, email); h.type(authMessages.en.password, password);
    await h.press(authMessages.en.login);
    assert.deepEqual(h.routes, []);
  }
});

test('after a refused login the email is prefilled and editable, or asked for; success leads back to login', async () => {
  const prefilled = await app({ params: { email } });
  assert.equal(prefilled.find(t.email).props.value, email);
  await enter(prefilled);
  assert.ok(prefilled.texts().includes(t.verified));
  assert.equal(named(prefilled, 'login').length, 0);
  await prefilled.press(authMessages.en.login);
  assert.deepEqual(prefilled.routes, [['dismissTo', '/login']]);

  const unknown = await app();
  assert.equal(unknown.find(t.email).props.value, '');
  assert.ok(unknown.texts().includes(t.emailHint));
  await enter(unknown);
  assert.equal(unknown.find(t.email).props.error, t.emailInvalid);
  await unknown.press(t.sendCode);
  assert.equal(unknown.calls.length, 0, 'nothing is sent without a valid email');
  unknown.type(t.email, ` ${email} `);
  assert.equal(unknown.find(t.email).props.error, undefined);
  await enter(unknown);
  assert.deepEqual(named(unknown, 'verifyEmailCode'), [{ email, code: '012345' }]);
});

test('an unusable email parameter is ignored', async () => {
  for (const value of ['not-an-email', ['a@b.co', 'c@d.co'], '']) assert.equal((await app({ params: { email: value } })).find(t.email).props.value, '');
});

test('Profile offers verification only while the email is unverified, in both languages', async () => {
  for (const language of ['en', 'ar']) {
    const h = await app({ screen: 'profile', language, signedIn: account });
    await h.press(messages[language].verify);
    assert.deepEqual(h.routes, [['push', '/verify-email-code']]);
    const verified = await app({ screen: 'profile', language, signedIn: { ...account, emailVerifiedAt: '2026-11-25T00:00:00.000Z' } });
    assert.equal(verified.find(messages[language].verify), undefined);
    assert.equal((await app({ screen: 'profile', language })).find(messages[language].verify), undefined);
  }
});

test('from Profile the account email is used, `me` is reloaded after success, and the screen returns', async () => {
  const at = '2026-11-25T00:00:00.000Z';
  for (const [canGoBack, expected] of [[true, 'BACK'], [false, ['replace', profileRoute]]]) {
    let verified = null;
    const h = await app({ canGoBack, signedIn: account, params: { email: 'other@example.invalid' },
      server: { verifyEmailCode: () => { verified = at; }, me: () => ({ ...account, emailVerifiedAt: verified }) } });
    assert.ok(h.texts().includes(t.sentTo(email)));
    assert.equal(h.find(t.email), undefined);
    assert.equal(h.find(t.backToLogin), undefined);
    await enter(h);
    assert.deepEqual(h.calls.map(call => call[0]), ['verifyEmailCode', 'me']);
    assert.equal(h.store.getSnapshot().user.emailVerifiedAt, at);
    assert.deepEqual(h.routes, [expected]);
  }
});

test('an already verified account is told so instead of being asked for a code', async () => {
  const h = await app({ signedIn: { ...account, emailVerifiedAt: '2026-11-25T00:00:00.000Z' } });
  assert.ok(h.texts().includes(t.alreadyVerified));
  assert.equal(h.find(t.code), undefined);
  await h.press(t.backToProfile);
  assert.deepEqual(h.routes, ['BACK']);
});

test('a failed session refresh while reading the mail does not change what is being verified', async () => {
  let offline = false;
  const h = await app({ signedIn: account, server: { me: () => { if (offline) throw new BackendError('Backend request failed.'); return account; } } });
  h.type(t.code, '0123');
  offline = true;
  await h.store.restore();
  assert.equal(h.store.getSnapshot().user, null);
  assert.ok(h.texts().includes(t.sentTo(email)));
  assert.equal(h.find(t.code).props.value, '0123');
});

test('the code field takes typed, pasted and Arabic digits and never sends a malformed code', async () => {
  const h = await app({ params: { email } });
  const field = h.find(t.code).props;
  assert.equal(field.code, true); assert.equal(field.keyboardType, 'number-pad'); assert.equal(field.autoComplete, 'one-time-code');
  assert.equal(field.maxLength, undefined, 'a native limit would cut a pasted code with spaces');
  for (const [typed, value] of [['٠١٢٣٤٥', '012345'], ['۰۱۲۳۴۵', '012345'], [' 012 345\n', '012345'], ['‏012345', '012345'], ['012-345', '012345'], ['0123456', '012345'], ['01a', '01']]) {
    h.type(t.code, typed);
    assert.equal(h.find(t.code).props.value, value, typed);
  }
  await enter(h, '01234');
  assert.equal(h.find(t.code).props.error, t.codeFormat);
  assert.equal(h.calls.length, 0);
  h.type(t.code, '012345');
  assert.equal(h.find(t.code).props.error, undefined);
});

test('invalid code, rate limit, network and other failures each show their own message and clear on edit', async () => {
  const failures = { invalidCode: () => refused('INVALID_EMAIL_VERIFICATION_CODE'), rateLimited: () => refused('TOO_MANY_REQUESTS'),
    network: () => { throw new BackendError('Backend request failed.'); }, error: () => refused('INTERNAL') };
  for (const language of ['en', 'ar']) for (const [key, fail] of Object.entries(failures)) {
    const m = messages[language];
    const h = await app({ language, params: { email }, server: { verifyEmailCode: fail, requestEmailVerificationCode: fail } });
    await enter(h, '012345', language);
    const notice = () => h.render().find(n => n.type === 'AuthNotice');
    assert.equal(notice().props.children, m[key]); assert.ok(!notice().props.success);
    h.type(m.code, '1'); assert.equal(notice(), undefined);
    if (key !== 'invalidCode') {
      await h.press(m.sendCode);
      assert.equal(notice().props.children, m[key]);
      assert.ok(!h.find(m.sendCode).props.disabled, 'a failed request starts no wait');
    }
  }
});

test('a missing backend address shows an error and leaves the screen usable', async () => {
  const h = await app({ params: { email }, server: { misconfigured: true } });
  await enter(h);
  assert.ok(h.texts().includes(t.error));
  assert.equal(h.find(t.verify).props.disabled, false);
});

test('one request at a time: repeated presses are ignored and the controls are disabled meanwhile', async () => {
  let finish;
  const h = await app({ params: { email }, server: { verifyEmailCode: () => new Promise(resolve => { finish = resolve; }) } });
  h.type(t.code, '012345');
  const button = h.find(t.verify).props, resend = h.find(t.sendCode).props;
  button.onPress(); button.onPress(); resend.onPress(); await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.find(t.verifying).props.busy, true);
  assert.equal(h.find(t.sendCode).props.disabled, true);
  assert.equal(h.find(t.code).props.editable, false); assert.equal(h.find(t.email).props.editable, false);
  h.render().find(n => n.type === 'AuthShell').props.onBack();
  assert.deepEqual(h.routes, []);
  finish(true); await tick();
  assert.ok(h.texts().includes(t.verified));
});

test('sign-up starts the 60-second wait; it counts from the deadline across backgrounding, then allows a resend', async ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const h = await signUp();
  assert.equal(h.find(t.resendIn(60)).props.disabled, true);
  h.find(t.resendIn(60)).props.onPress(); await tick();
  assert.equal(named(h, 'requestEmailVerificationCode').length, 0);
  ctx.mock.timers.tick(15_000);
  assert.ok(h.find(t.resendIn(45)));
  // In the background timers stop but time passes: the first tick afterwards catches up.
  ctx.mock.timers.setTime(1_000_000 + 59_000); ctx.mock.timers.tick(500);
  assert.ok(h.find(t.resendIn(1)));
  ctx.mock.timers.tick(500);
  h.type(t.code, '111111');
  await h.press(t.resend);
  assert.deepEqual(named(h, 'requestEmailVerificationCode'), [{ email }]);
  assert.equal(h.find(t.resendIn(60)).props.disabled, true);
  assert.equal(h.find(t.code).props.value, '', 'only the newest code works');
  const notice = h.render().find(n => n.type === 'AuthNotice').props;
  assert.equal(notice.children, t.requested); assert.equal(notice.success, true);
});

test('after a refused login a code can be sent at once, and each address has its own wait', async ctx => {
  ctx.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 });
  const h = await app({ params: { email } });
  assert.ok(h.render().find(n => n.type === 'AuthShell' && n.props.subtitle === t.introSend));
  await h.press(t.sendCode);
  assert.ok(h.find(t.resendIn(60)));
  h.type(t.email, email.toUpperCase());
  assert.ok(h.find(t.resendIn(60)), 'the same address in other letters');
  h.type(t.email, 'other@example.invalid');
  assert.equal(h.find(t.resend).props.disabled, false);
});

test('Back returns to the previous screen, or to login or Profile when there is none', async () => {
  const back = async options => { const h = await app(options); h.render().find(n => n.type === 'AuthShell').props.onBack(); return h.routes; };
  assert.deepEqual(await back({ params: { email } }), ['BACK']);
  assert.deepEqual(await back({ canGoBack: false }), [['replace', '/login']]);
  assert.deepEqual(await back({ canGoBack: false, signedIn: account }), [['replace', profileRoute]]);
});

test('the real code input stays left to right in Arabic while other inputs and the page follow the language', () => {
  for (const language of ['en', 'ar']) {
    const element = (type, props) => ({ type, props });
    const mocks = {
      react: { useState: initial => [initial, () => {}] }, 'react/jsx-runtime': { jsx: element, jsxs: element },
      'react-native': { ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'TextInput', 'View'].map(k => [k, k])), Platform: { OS: 'ios' } },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@/components/ui/core': { AppText: 'AppText', Button: 'Button' }, './brand': { Brand: 'Brand' },
      '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) }, '@/theme/fonts': { useRemyFonts: () => ({ body: 'System' }) },
      '@/providers/language-provider': { useLanguage: () => ({ language }) }, '@/i18n/auth': { authMessages },
    };
    const ui = {};
    new Function('require', 'exports', transpile(fs.readFileSync('src/components/auth-ui.tsx', 'utf8')))(id => { assert.ok(mocks[id], id); return mocks[id]; }, ui);
    const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : !n || typeof n !== 'object' ? [] : [n, ...nodes(n.props?.children)];
    const input = props => nodes(ui.AuthInput({ label: 'Field', value: '012345', ...props })).find(n => n.type === 'TextInput').props;
    const code = input({ code: true });
    assert.equal(code.style.direction, 'ltr'); assert.equal(code.style.writingDirection, 'ltr'); assert.equal(code.style.textAlign, 'center');
    assert.equal(code.code, undefined, 'the flag is not passed to the native input');
    assert.equal(input({}).style.textAlign, language === 'ar' ? 'right' : 'left');
    assert.equal(input({}).style.direction, undefined);
    const shell = nodes(ui.AuthShell({ title: 'T', subtitle: 'S', onBack() {} }));
    assert.equal(shell.find(n => n.props.style?.maxWidth === 460).props.style.direction, language === 'ar' ? 'rtl' : 'ltr');
  }
});

test('the Arabic screen shows Arabic copy throughout and the route exports the screen', async () => {
  const h = await app({ language: 'ar', params: { email } });
  const ar = messages.ar;
  for (const label of [ar.email, ar.code, ar.verify, ar.sendCode, ar.backToLogin]) assert.ok(h.find(label), label);
  for (const text of [...h.texts(), h.render().find(n => n.type === 'AuthShell').props.title]) assert.match(text, /[؀-ۿ]/u);
  assert.match(fs.readFileSync('src/app/verify-email-code.tsx', 'utf8'), /export \{ default \} from '@\/screens\/email-verification-screen'/);
});
