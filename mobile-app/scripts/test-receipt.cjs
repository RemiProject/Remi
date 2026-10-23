const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { recognizeReceipt, receiptImageUri } = require('../src/services/receipt-ocr-core.ts');
const { receiptMessages } = require('../src/i18n/receipt.ts');
test('OCR uses managed images, Android paths, real output and releases resolved resources', async () => {
  const released = []; let input;
  const storage = { resolve: async () => 'file:///data/receipt%20one.jpg', release: uri => released.push(uri) };
  const result = await recognizeReceipt('photo_x.jpg', storage, { isSupported: true, extractTextFromImage: async uri => { input = uri; return ['Milk 2.99', 'TOTAL 2.99']; } }, 'android');
  assert.equal(input, '/data/receipt one.jpg');
  assert.deepEqual(result, { status: 'success', text: 'Milk 2.99\nTOTAL 2.99' });
  assert.equal(released.length, 1);
  assert.equal(receiptImageUri('file:///a.jpg', 'ios'), 'file:///a.jpg');
  assert.equal(receiptImageUri('content://photo/1', 'android'), 'content://photo/1');
});
test('OCR reports empty, missing, failure and unavailable without fabricated output', async () => {
  let releases = 0;
  const storage = { resolve: async () => '/a.jpg', release: () => releases++ };
  const engine = { isSupported: true, extractTextFromImage: async () => ['  '] };
  assert.equal((await recognizeReceipt('x', storage, engine, 'ios')).status, 'empty');
  engine.extractTextFromImage = async () => { throw Error('native failure'); };
  assert.deepEqual(await recognizeReceipt('x', storage, engine, 'ios'), { status: 'error', text: '' });
  assert.equal(releases, 2);
  assert.equal((await recognizeReceipt('x', { ...storage, resolve: async () => null }, engine, 'ios')).status, 'error');
  assert.equal((await recognizeReceipt('x', storage, null, 'android')).status, 'unavailable');
  assert.equal((await recognizeReceipt('x', storage, engine, 'web')).status, 'unavailable');
});
test('receipt translation keys match and Arabic labels exist', () => {
  assert.deepEqual(Object.keys(receiptMessages.en), Object.keys(receiptMessages.ar));
  for (const key of Object.keys(receiptMessages.en)) {
    assert.ok(receiptMessages.en[key]); assert.match(receiptMessages.ar[key], /[\u0600-\u06ff]/u);
  }
});
test('actual review handlers retain edits, require explicit handoff and guard double confirmation', async () => {
  let language = 'en', index = 0; const states = [], refs = []; const routes = [];
  const element = (type, props) => ({ type, props });
  const mocks = {
    react: {
      useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useRef(initial) { const i = index++; return refs[i] ??= { current: initial }; },
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: { replace: value => routes.push(value), canGoBack: () => true, back: () => routes.push('back') } },
    '@/components/food-photo-field': { FoodPhotoField: 'Photo' },
    '@/components/ui/core': Object.fromEntries(['AppText', 'Button', 'PageHeader', 'Screen'].map(key => [key, key])),
    '@/components/ui/form-field': { FormField: 'Field' },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) },
    '@/i18n/receipt': { receiptMessages },
    '@/services/receipt-ocr': { scanReceipt: async () => ({ status: 'success', text: 'Milk 2.99' }) },
    '@/domain/inventory': { MAX_NAME_LENGTH: 100 },
  };
  const compiled = ts.transpileModule(fs.readFileSync('src/screens/receipt-screen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; new Function('require', 'exports', compiled)(id => { assert.ok(mocks[id], id); return mocks[id]; }, exports);
  function flatten(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)]; }
  const render = () => { index = 0; return flatten(exports.default()); };
  let nodes = render();
  nodes.find(n => n.type === 'Photo').props.onChange('photo_receipt.jpg');
  nodes = render(); await nodes.find(n => n.props?.label === receiptMessages.en.scan).props.onPress();
  // onPress intentionally voids the promise, allow OCR state to settle.
  await Promise.resolve(); nodes = render();
  nodes.find(n => n.props?.label === receiptMessages.en.text).props.onChangeText('Corrected milk');
  nodes = render(); assert.equal(nodes.find(n => n.props?.label === receiptMessages.en.text).props.value, 'Corrected milk');
  nodes.find(n => n.props?.label === receiptMessages.en.continue).props.onPress();
  assert.equal(routes.length, 0);
  nodes = render(); assert.equal(nodes.find(n => n.props?.label === receiptMessages.en.name).props.error, receiptMessages.en.required);
  nodes.find(n => n.props?.label === receiptMessages.en.name).props.onChangeText('Milk');
  language = 'ar'; nodes = render(); assert.equal(nodes.find(n => n.type === 'Screen').props.rtl, true);
  const confirm = nodes.find(n => n.props?.label === receiptMessages.ar.continue).props.onPress;
  confirm(); confirm(); assert.deepEqual(routes, [{ pathname: '/food/manual', params: { initialName: 'Milk' } }]);
  // No inventory provider is imported by the review screen: only the existing manual form can save.
  assert.doesNotMatch(compiled, /inventory-provider|createItem|updateItem/);
  refs.length = 0; states.length = 0; routes.length = 0;
  render().find(n => n.props?.label === receiptMessages.ar.cancel).props.onPress();
  assert.deepEqual(routes, ['back']);
});
