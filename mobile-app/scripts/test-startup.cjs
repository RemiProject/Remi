const fs = require('node:fs'), test = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(id => mocks[id] ?? require(id), exports);
  return exports;
}
function gate() {
  const state = { auth: { ready: false }, language: { ready: false, error: false }, theme: { ready: false }, fonts: { ready: false } };
  let opened = false;
  const { StartupGate } = load('src/components/startup-gate.tsx', {
    react: { useState: () => [opened, value => { opened = value; }] },
    '@/providers/auth-provider': { useAuth: () => state.auth }, '@/providers/language-provider': { useLanguage: () => state.language },
    '@/theme/provider': { useRemyTheme: () => state.theme }, '@/theme/fonts': { useRemyFonts: () => state.fonts }, './app-skeleton': { AppSkeleton: 'Skeleton' },
  });
  return { state, render: () => StartupGate({ children: 'navigation' }) };
}
test('startup skeleton waits for real hydration and fonts, then preserves navigation during later refreshes', () => {
  const h = gate(); assert.equal(h.render().type, 'Skeleton');
  for (const key of ['auth','language','theme']) { h.state[key].ready = true; assert.equal(h.render().type, 'Skeleton'); }
  h.state.fonts.ready = true; assert.equal(h.render(), 'navigation');
  h.state.auth.ready = false; h.state.language.ready = false;
  assert.equal(h.render(), 'navigation');
});
test('a failed preference read uses the available language instead of trapping startup', () => {
  const h = gate(); h.state.auth.ready = true; h.state.theme.ready = true; h.state.fonts.ready = true; h.state.language.error = true;
  assert.equal(h.render(), 'navigation');
});
test('skeleton respects Reduce Motion and exposes one indeterminate loading surface without buttons', () => {
  for (const reduced of [false,true]) {
    const { AppSkeleton } = load('src/components/app-skeleton.tsx', {
      'react-native': { ScrollView: 'ScrollView', View: 'View' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      'expo-status-bar': { StatusBar: 'StatusBar' }, 'expo-splash-screen': { hide() {} },
      'react-native-reanimated': { __esModule: true, default: { createAnimatedComponent: () => 'Pulse' }, useReducedMotion: () => reduced },
      './brand': { Brand: 'Brand' }, '@/theme/provider': { useRemyTheme: () => ({ colors: {}, mode: 'light' }) }, '@/providers/language-provider': { useLanguage: () => ({ language: 'ar' }) }, './ui/core': { AppText: 'AppText' },
    });
    const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : !n || typeof n !== 'object' ? [] : [n,...nodes(n.props?.children)];
    const tree = nodes(AppSkeleton({})), loader = tree.find(n => n.props?.testID === 'app-startup-skeleton');
    assert.equal(loader.props.accessibilityRole,'progressbar'); assert.equal(loader.props.accessibilityState.busy,true);
    assert.match(loader.props.accessibilityLabel,/جارٍ/);
    assert.equal(tree.some(n => n.props?.accessibilityRole === 'button'),false);
    for (const pulse of tree.filter(n => n.type === 'Pulse')) assert.equal(pulse.props.style.some(s => s?.animationName !== undefined),!reduced);
  }
});
