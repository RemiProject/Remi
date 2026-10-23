const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { authMessages } = require('../src/i18n/auth.ts');
const { passwordRules } = require('../src/services/auth-form.ts');
const { authErrorKey } = require('../src/services/auth-validation.ts');

function harness() {
  let cursor = 0, token = 'test-token';
  const states = [], routes = [], requests = [];
  const element = (type, props) => ({ type, props });
  const react = { useState: initial => {
    const i = cursor++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
  } };
  react.useRef = initial => react.useState(() => ({ current: initial }))[0];
  const mocks = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { ...Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','Pressable','ScrollView','TextInput','View'].map(k => [k,k])), Platform: { OS: 'ios' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/ui/core': { AppText: 'AppText' },
    '@/components/auth-ui': Object.fromEntries(['AuthShell','AuthInput','AuthAction','AuthNotice','AuthLink'].map(k => [k,k])),
    '@/theme/provider': { useRemyTheme: () => ({ colors: { border: '#ddd', primary: '#293E7A' } }) },
    '@/theme/fonts': { useRemyFonts: () => ({ body: 'System' }) },
    '@/providers/language-provider': { useLanguage: () => ({ language: 'en' }) },
    '@/providers/auth-provider': { useAuth: () => ({ restore: async () => {} }) },
    '@/i18n/auth': { authMessages }, '@/services/auth-form': { passwordRules }, '@/services/auth-validation': { authErrorKey },
    '@/services/auth': { getAuth: () => ({ requestPasswordReset: async email => requests.push({ email }), resetPassword: async (token, password) => requests.push({ token, password }) }) },
    'expo-router': { useLocalSearchParams: () => ({ token }), router: { replace: r => routes.push(r), setParams: () => { token = undefined; } } },
  };
  function load(file) {
    const exports = {};
    new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => { assert.ok(mocks[id], id); return mocks[id]; },exports);
    return exports;
  }
  const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : !n || typeof n !== 'object' ? [] : [n, ...nodes(n.props?.children)];
  return { load, requests, routes, render: (component, props = {}) => { cursor = 0; return nodes(component(props)); } };
}

test('real password input defaults to masked and reliably toggles visibility across focus changes', () => {
  const h = harness(), { AuthInput } = h.load('src/components/auth-ui.tsx');
  const render = () => h.render(AuthInput, { label: 'Password', password: true, value: 'Synthetic123!' });
  assert.equal(render().find(n => n.type === 'TextInput').props.secureTextEntry, true);
  render().find(n => n.type === 'Pressable').props.onPress();
  assert.equal(render().find(n => n.type === 'TextInput').props.secureTextEntry, false);
  render().find(n => n.type === 'TextInput').props.onBlur();
  render().find(n => n.type === 'Pressable').props.onPress();
  assert.equal(render().find(n => n.type === 'TextInput').props.secureTextEntry, true);
});

test('responsive shell scrolls, avoids keyboard, constrains desktop width, and social controls are unavailable', () => {
  const h = harness(), ui = h.load('src/components/auth-ui.tsx');
  const shell = h.render(ui.AuthShell, { title: 'Test', subtitle: 'Test', onBack() {} });
  const scroll = shell.find(n => n.type === 'ScrollView');
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(shell.find(n => n.type === 'KeyboardAvoidingView').props.behavior, 'padding');
  const container = shell.find(n => n.type === 'View' && n.props.style?.maxWidth === 460);
  assert.equal(container.props.style.width, '100%');
  // The same responsive rules fit narrow phones and cap wide screens.
  for (const viewport of [320, 375, 430, 1024]) assert.ok(Math.min(viewport - 40, container.props.style.maxWidth) <= viewport - 40);
  const social = h.render(ui.AuthSocial).filter(n => n.type === 'Pressable');
  assert.equal(social.length, 2);
  assert.ok(social.every(n => n.props.disabled && n.props.accessibilityState.disabled));
});

test('forgot password validates email and shows a non-enumerating success message', async () => {
  const h = harness(), Screen = h.load('src/screens/password-reset-screen.tsx').default;
  const render = () => h.render(Screen);
  render().find(n => n.type === 'AuthAction').props.onPress(); await new Promise(r => setImmediate(r));
  assert.equal(h.requests.length, 0);
  render().find(n => n.type === 'AuthInput').props.onChangeText('test@example.invalid');
  render().find(n => n.type === 'AuthAction').props.onPress(); await new Promise(r => setImmediate(r));
  assert.deepEqual(h.requests, [{ email: 'test@example.invalid' }]);
  assert.ok(render().some(n => n.props.children === authMessages.en.resetSent));
});

test('reset password enforces confirmation and submits only the token and new password', async () => {
  const h = harness(), Screen = h.load('src/screens/password-reset-screen.tsx').default;
  const render = () => h.render(Screen, { reset: true });
  render().find(n => n.props.label === authMessages.en.password).props.onChangeText('Strong123!');
  render().find(n => n.props.label === authMessages.en.confirmPassword).props.onChangeText('mismatch');
  render().find(n => n.type === 'AuthAction').props.onPress(); await new Promise(r => setImmediate(r));
  assert.equal(h.requests.length, 0);
  assert.ok(render().some(n => n.props.children === authMessages.en.passwordMismatch));
  render().find(n => n.props.label === authMessages.en.confirmPassword).props.onChangeText('Strong123!');
  render().find(n => n.type === 'AuthAction').props.onPress(); await new Promise(r => setImmediate(r));
  assert.deepEqual(h.requests, [{ token: 'test-token', password: 'Strong123!' }]);
  assert.ok(render().some(n => n.props.children === authMessages.en.resetDone));
});
