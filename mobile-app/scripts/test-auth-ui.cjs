const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { AuthStore } = require('../src/repositories/auth-store.ts');
const { authErrorKey } = require('../src/services/auth-validation.ts');
const authForm = require('../src/services/auth-form.ts');
const { authMessages } = require('../src/i18n/auth.ts');
const user = { id: 'test-user', name: 'Test User', email: 'test@example.invalid', timezone: 'Africa/Cairo', languageCode: 'en', emailVerifiedAt: null };
const refs = { countries: [{ code: 'EG', name: 'Egypt' }], locales: [{ code: 'en-EG', name: 'English', languageCode: 'en' }] };
const valid = { email: user.email, identifier: user.email, password: 'Test-password1!', confirmPassword: 'Test-password1!', name: user.name, username: 'test_user', phoneNumber: '01012345678' };
const tick = () => new Promise(resolve => setImmediate(resolve));

// The same lightweight component harness pattern used by the existing screen tests.
function screenHarness({ signup = false, service = {}, language = 'en', snapshot, backendInventory = true } = {}) {
  const states = [], effects = [], routes = [];
  let cursor = 0;
  const auth = snapshot || { user: null, ready: true, busy: false, error: null,
    login: async () => true, logout: async () => {}, restore: async () => {} };
  const element = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef(initial) { const [value] = this.useState(() => ({ current: initial })); return value; },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!states[i] || deps.some((d, n) => d !== states[i][n])) { states[i] = deps; effects.push(effect); }
    },
  };
  // Transpiled hooks are called as standalone functions.
  react.useRef = initial => { const [value] = react.useState(() => ({ current: initial })); return value; };
  const mocks = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { View: 'View', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: { push: r => routes.push(r), replace: r => routes.push(r), back() {}, canGoBack: () => false } },
    '@/providers/auth-provider': { useAuth: () => auth },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) },
    '@/components/ui/core': { ...Object.fromEntries(['AppText', 'Button', 'Card', 'Chip', 'PageHeader', 'Screen'].map(k => [k, k])), uiStyles: { wrap: {} } },
    '@/components/ui/form-field': { FormField: 'FormField' },
    '@/components/auth-ui': { AuthAction: 'Button', AuthLink: 'Button', AuthInput: 'FormField', AuthNotice: 'AppText', AuthShell: 'Screen', AuthSocial: 'Social' },
    '@/services/auth': { getAuth: () => ({ registrationReferences: async () => refs, register: async () => ({ userId: user.id }), ...service }) },
    '@/services/auth-validation': { authErrorKey }, '@/i18n/auth': { authMessages },
    '@/services/auth-form': authForm,
    '@/services/inventory-feature': { isBackendInventoryEnabled: () => backendInventory },
    './profile-screen': { __esModule: true, default: 'ProfileScreen' },
  };
  function load(path) {
    const exports = {};
    new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText)(id => { assert.ok(mocks[id], id); return mocks[id]; }, exports);
    return exports.default;
  }
  const Form = load('src/screens/auth-screen.tsx');
  const Profile = load('src/screens/profile-screen.tsx');
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : !tree || typeof tree !== 'object' ? [] : [tree, ...nodes(tree.props?.children)];
  const render = (profile = false) => { cursor = 0; return nodes(profile ? Profile() : Form({ signup })); };
  const find = (type, label) => render().find(n => n.type === type && n.props.label === label);
  return { auth, routes, render, flush: () => { while (effects.length) effects.shift()(); },
    change: (key, value) => find('FormField', authMessages[language][key]).props.onChangeText(value),
    press: key => find('Button', authMessages[language][key]).props.onPress(),
    fill: input => Object.entries(input).forEach(([k, v]) => find('FormField', authMessages[language][k])?.props.onChangeText(v)),
  };
}

test('login validates, masks password, prevents duplicate requests, clears password and returns to Profile', async () => {
  let calls = 0, complete;
  const h = screenHarness();
  h.auth.login = async input => { calls++; assert.deepEqual(input, { identifier: user.email, password: valid.password }); return new Promise(r => { complete = r; }); };
  h.press('login'); await tick(); assert.equal(calls, 0);
  assert.ok(h.render().some(n => n.props.error === authMessages.en.identifierInvalid));
  h.fill(valid);
  assert.equal(h.render().find(n => n.props.label === authMessages.en.password).props.password, true);
  h.press('login'); h.press('wait'); assert.equal(calls, 1);
  assert.ok(h.render().find(n => n.type === 'Button' && n.props.label === authMessages.en.wait).props.disabled);
  complete(true); await tick();
  assert.deepEqual(h.routes, [{ pathname: '/feature', params: { feature: 'profile' } }]);
  assert.equal(h.render().find(n => n.props.label === authMessages.en.password).props.value, '');
});

test('failed login stays on form and shows verification guidance without raw backend errors', async () => {
  const h = screenHarness();
  h.auth.login = async () => { h.auth.error = 'verifyFirst'; return false; };
  h.fill(valid); h.press('login'); await tick();
  assert.equal(h.routes.length, 0);
  assert.ok(h.render().some(n => n.props.children === authMessages.en.verifyFirst));
  assert.equal(h.render().find(n => n.props.label === authMessages.en.password).props.value, '');
});

test('signup validates six fields, hides locale/timezone and registers without logging in', async () => {
  let input, loginCalls = 0;
  const h = screenHarness({ signup: true, service: { register: async value => { input = value; return { userId: user.id }; } } });
  h.auth.login = async () => { loginCalls++; };
  h.render(); h.flush(); await tick();
  h.press('signup'); assert.equal(input, undefined);
  h.fill(valid); h.press('signup'); await tick();
  assert.deepEqual(input, { name: valid.name, username: valid.username, email: valid.email, password: valid.password, phoneNumber: '+201012345678', languageCode: 'en' }); assert.equal(loginCalls, 0);
  assert.ok(h.render().some(n => n.props.children === authMessages.en.registered));
  h.press('login'); assert.deepEqual(h.routes, ['/login']);
});

test('signup handles duplicate usernames with friendly guidance', async () => {
  const h = screenHarness({ signup: true, service: {
    register: async () => { throw { codes: ['USERNAME_TAKEN'] }; },
  } });
  h.render(); h.flush(); await tick();
  h.fill(valid); h.press('signup'); await tick();
  assert.ok(h.render().some(n => n.props.children === authMessages.en.usernameTaken));
});

test('Profile exposes guest entry points, account identity and logout in both languages', async () => {
  for (const language of ['en', 'ar']) {
    const h = screenHarness({ language });
    let tree = h.render(true);
    assert.ok(tree.some(n => n.props.label === authMessages[language].login));
    assert.equal(tree.find(n => n.type === 'Screen').props.rtl, language === 'ar');
    h.auth.user = user;
    h.auth.logout = async () => { h.auth.user = null; };
    tree = h.render(true);
    assert.ok(tree.some(n => n.props.children === user.email));
    await tree.find(n => n.props.label === authMessages[language].logout).props.onPress();
    assert.ok(h.render(true).some(n => n.props.label === authMessages[language].login));
  }
});

test('auth store restores, logs in, clears state on logout failure, and can retry restoration', async () => {
  let loggedIn = false;
  const service = { login: async () => { loggedIn = true; }, me: async () => { if (!loggedIn) throw { code: 'NO_SESSION' }; return user; },
    logout: async () => { loggedIn = false; throw new Error('offline'); } };
  const store = new AuthStore(() => service);
  await store.restore(); assert.equal(store.getSnapshot().ready, true); assert.equal(store.getSnapshot().user, null);
  assert.equal(await store.login(valid), true); assert.deepEqual(store.getSnapshot().user, user);
  const restored = new AuthStore(() => service); await restored.restore(); assert.deepEqual(restored.getSnapshot().user, user);
  await store.logout(); assert.equal(store.getSnapshot().user, null); assert.equal(store.getSnapshot().error, 'logoutError');
  await store.restore(); assert.equal(store.getSnapshot().error, null);
});

test('signup validation enforces strength, confirmation, username and mobile formats', () => {
  assert.deepEqual(authForm.validateAuthDraft(valid, true, 'EG'), {});
  for (const [field, value] of Object.entries({ name: ' ', password: 'short', email: 'invalid', username: '1bad', phoneNumber: '123', confirmPassword: 'mismatch' })) {
    assert.ok(authForm.validateAuthDraft({ ...valid, [field]: value }, true, 'EG')[field], field);
  }
  for (const password of ['lower123!', 'Uppercase!', 'NoSpecial123', 'Strong1العربية']) assert.ok(authForm.validateAuthDraft({ ...valid, password, confirmPassword: password }, true, 'EG').password);
  assert.equal(authForm.normalizePhone('050 123 4567', 'SA'), '+966501234567');
  assert.equal(authForm.normalizePhone('+201012345678', 'EG'), '+201012345678');
  assert.equal(authForm.normalizePhone('+966501234567', 'EG'), '');
  assert.deepEqual(authForm.validateAuthDraft({ ...valid, identifier: 'test_user' }, false, 'EG'), {});
  assert.deepEqual(Object.keys(authMessages.en).sort(), Object.keys(authMessages.ar).sort());
  for (const message of Object.values(authMessages.ar)) assert.match(message, /[\u0600-\u06ff]/u);
});

test('signup only shows the six requested inputs and login offers reset and social affordances', () => {
  const signup = screenHarness({ signup: true }).render();
  assert.deepEqual(signup.filter(n => n.type === 'FormField').map(n => n.props.label), ['Full name', 'Username', 'Email', 'Mobile phone number', 'Password', 'Confirm password']);
  const h = screenHarness();
  assert.ok(h.render().some(n => n.type === 'Social'));
  h.press('forgotPassword'); assert.deepEqual(h.routes, ['/forgot-password']);
});

test('Egypt/Saudi calling code selection changes normalization without a country text field', async () => {
  let input;
  const h = screenHarness({ signup: true, service: { register: async v => { input = v; return { userId: user.id }; } } });
  const toggle = h.render().find(n => n.type === 'Pressable' && n.props.accessibilityLabel?.startsWith(authMessages.en.phoneCountry));
  toggle.props.onPress();
  h.render().filter(n => n.props.accessibilityRole === 'radio')[1].props.onPress();
  h.fill({ ...valid, phoneNumber: '0501234567' }); h.press('signup'); await tick();
  assert.equal(input.phoneNumber, '+966501234567');
});


test('Profile copy changes only for backend inventory, in both languages', () => {
  for (const language of ['en', 'ar']) {
    for (const backendInventory of [false, true]) {
      const h = screenHarness({ language, backendInventory });
      const texts = h.render(true).filter(node => node.type === 'AppText').map(node => node.props.children);
      assert(texts.includes(authMessages[language][backendInventory ? 'backendKitchen' : 'local']));
      assert(!texts.includes(authMessages[language][backendInventory ? 'local' : 'backendKitchen']));
    }
  }
});
