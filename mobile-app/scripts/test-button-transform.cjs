const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const ts = require('typescript');
const babel = require('@babel/core');

const flatten = (style) => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style;
const coreSource = fs.readFileSync('src/components/ui/core.tsx', 'utf8');
const compiled = ts.transpileModule(coreSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const core = { exports: {} };
// Inspect the real Button style callback without needing a native rendering host.
new Function('require', 'exports', compiled)((id) => {
  if (id === 'react') return { ...require('react'), useState: () => [false, () => {}] };
  if (id === 'react-native') return { Pressable: 'Pressable', StyleSheet: { create: (value) => value } };
  if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: {} }) };
  if (id === '@/theme/fonts') return { useRemyFonts: () => ({}) };
  if (id === '@/theme/tokens') return { layout: {}, spacing: {}, radii: {}, typography: {} };
  if (id === './icon') return { Icon: () => null };
  return require(id);
}, core.exports);

function loadNativeSource(filename, dependency) {
  const output = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, presets: [require.resolve('@react-native/babel-preset')], babelrc: false, configFile: false,
  }).code;
  const module = { exports: {} };
  const nativeRequire = createRequire(fs.realpathSync(filename));
  new Function('require', 'module', 'exports', '__DEV__', output)((id) => dependency(id, nativeRequire), module, module.exports, true);
  return module.exports;
}
const processTransform = loadNativeSource('node_modules/react-native/Libraries/StyleSheet/processTransform.js', (id, nativeRequire) =>
  id.includes('stringifySafe') ? { default: JSON.stringify } : nativeRequire(id)).default;
const payload = loadNativeSource('node_modules/react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload.js', (id, nativeRequire) => {
  if (id.includes('flattenStyle')) return flatten;
  if (id.includes('deepDiffer')) return (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  return nativeRequire(id);
});
const attributes = { style: { transform: { process: processTransform } } };

test('installed renderer reproduces the pressed-to-undefined transform crash', () => {
  assert.throws(() => payload.diff({ style: { transform: [{ scale: 0.98 }] } }, { style: { transform: undefined } }, attributes), /forEach/);
});
test('Button omits transforms when idle/disabled and uses a valid pressed array', () => {
  for (const variant of ['primary', 'secondary', 'text', 'destructive', 'dangerText']) {
    for (const disabled of [false, true]) {
      const button = core.exports.Button({ label: 'Test', variant, disabled });
      const idle = flatten(button.props.style({ pressed: false }));
      const pressed = flatten(button.props.style({ pressed: true }));
      assert.equal(Object.hasOwn(idle, 'transform'), false);
      if (disabled) assert.equal(Object.hasOwn(pressed, 'transform'), false);
      else assert.deepEqual(pressed.transform, [{ scale: 0.98 }]);
      assert.doesNotThrow(() => payload.create({ style: idle }, attributes));
      assert.doesNotThrow(() => payload.create({ style: pressed }, attributes));
      assert.doesNotThrow(() => payload.diff({ style: idle }, { style: pressed }, attributes));
      assert.doesNotThrow(() => payload.diff({ style: pressed }, { style: idle }, attributes));
    }
  }
});
