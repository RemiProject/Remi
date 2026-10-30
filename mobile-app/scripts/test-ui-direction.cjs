const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const sourceRoot = path.resolve('src');

function fixture(language = 'ar') {
  const cache = new Map();
  const item = { id: 'batch', foodId: 'food', name: 'rice', arabicName: 'أرز', quantity: '0.750', unitId: 'kg', storageId: 'pantry', backendUnit: 'KILOGRAM', backendStorageLocation: 'PANTRY', expirationDate: '2026-11-29', readOnly: false, version: 1 };
  const spoon = { ...item, id: 'spoon', name: 'olive oil', arabicName: 'زيت الزيتون', quantity: '2.000', unitId: null, backendUnit: 'TABLESPOON', storageId: null, backendStorageLocation: 'COUNTER', readOnly: true };
  const pieces = { ...item, id: 'pieces', name: 'tomato', arabicName: 'طماطم', quantity: '2.000', unitId: 'pieces', backendUnit: 'PIECE', storageId: 'refrigerator', backendStorageLocation: 'FRIDGE' };
  const colors = { background: 'white', surface: '#fff', text: '#222', textSecondary: '#444', textSubtle: '#666', primary: '#293e7a' };
  let details = item;
  function load(relative) {
    const filename = path.resolve(sourceRoot, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exported = {}; cache.set(filename, exported);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'exports', output)(id => {
      if (id === 'react-native') return native;
      if (id === 'expo-router') return { router: {}, useLocalSearchParams: () => ({ id: details.id }), useFocusEffect: () => {} };
      if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors }) };
      if (id === '@/theme/fonts') return { useRemyFonts: () => ({ body: 'Arial', heading: 'Arial', brand: 'Arial' }) };
      if (id === '@/providers/language-provider') return { useLanguage: () => ({ language }) };
      if (id === '@/providers/inventory-provider') return { useInventory: () => ({ items: [], status: 'ready' }) };
      if (id === '@/providers/backend-kitchen-provider') return { useBackendKitchen: () => ({ owner: 'user', status: 'ready', items: [item, spoon, pieces], today: '2026-10-31', detail: { id: details.id, status: 'ready', item: details }, loadDetail: () => {} }) };
      if (id === '@/components/backend-stock-actions') return { BackendStockActions: () => null };
      if (id === '@/components/appearance-controls') return { AppearanceControls: () => null };
      if (id === './home-screen') return { __esModule: true, default: () => null };
      // Symbol graphics are stubbed; the real Icon and ActionRow transforms are retained.
      if (id === 'expo-symbols') return { SymbolView: ({ name }) => React.createElement(native.View, { testID: `symbol-${name.web}`, style: { width: 8, height: 8, borderRightWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }] } }) };
      if (id.startsWith('@/')) {
        const relativePath = id.slice(2);
        return load(fs.existsSync(path.resolve(sourceRoot, relativePath + '.tsx')) ? relativePath + '.tsx' : relativePath + '.ts');
      }
      if (id.startsWith('.')) {
        const base = path.relative(sourceRoot, path.resolve(path.dirname(filename), id));
        return load(fs.existsSync(path.resolve(sourceRoot, base + '.tsx')) ? base + '.tsx' : base + '.ts');
      }
      return require(id);
    }, exported);
    return exported;
  }
  const core = load('components/ui/core.tsx');
  const screen = load('screens/backend-kitchen-screen.tsx');
  const wrap = (id, element) => React.createElement('section', { id, style: { width: 560, padding: 12 } }, element);
  const parts = [wrap('kitchen', React.createElement(screen.BackendKitchenScreen))];
  for (const entry of [item, spoon]) {
    details = entry;
    // Render now because the provider stub deliberately selects one batch at a time.
    parts.push(React.createElement('section', { key: entry.id, id: `detail-${entry.id}`, dangerouslySetInnerHTML: { __html: renderToStaticMarkup(React.createElement(screen.BackendFoodDetailScreen)) } }));
  }
  const stock = load('i18n/backend-stock-actions.ts').stockActionMessages[language];
  const number = load('utils/backend-kitchen-view.ts').inventoryNumberLabel;
  parts.push(wrap('insufficient', React.createElement(core.ScreenDirectionProvider, { value: language === 'ar' }, React.createElement(core.AppText, { dir: language === 'ar' ? 'rtl' : undefined }, stock.insufficient(`${number('1.25', language)} ${language === 'ar' ? 'كغ' : 'kg'}`)))));
  parts.push(wrap('legacy-row', React.createElement(core.ScreenDirectionProvider, { value: language === 'ar' }, React.createElement(core.ActionRow, { title: 'Remy Chat', rtl: language === 'ar', onPress: () => {} }))));
  parts.push(wrap('more', React.createElement(load('screens/more-screen.tsx').default)));
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...parts));
  return { html: `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}</style></head><body>${html}</body></html>`, load, native };
}

module.exports = { fixture };

test('real React Native Web markup gives Arabic inventory paragraphs an explicit RTL base and one logical text run', () => {
  const { html } = fixture('ar');
  for (const line of ['\u20660.75\u2069 كغ · خزانة الطعام', '\u20662\u2069 قطع · الثلاجة', '\u20662\u2069 م.ك · على سطح العمل', '\u20662\u2069 م.ك', 'لديك \u20661.25\u2069 كغ فقط', `الأيام المتبقية للانتهاء: \u2066${(29).toLocaleString('ar')}\u2069`]) {
    const start = html.indexOf(line); assert.notEqual(start, -1, line);
    const element = html.slice(html.lastIndexOf('<', start), start);
    assert.match(element, /dir="rtl"/, line);
  }
  assert(!html.includes('\u2067')); // No surrounding LTR/storage isolation.
});
test('English inventory labels and paragraphs stay unchanged', () => {
  const { html, load } = fixture('en');
  for (const line of ['0.75 kg · Pantry', '2 pieces · Refrigerator', '2 tbsp · Counter', 'Days until expiration: 29']) assert(html.includes(line), line);
  assert.equal(load('utils/backend-kitchen-view.ts').backendQuantityLabel({ quantity: '1.250', unitId: 'kg' }, 'en'), '1.25 kg');
});
test('explicit paragraph direction is opt-in; shared text without it keeps the existing default', () => {
  const { load } = fixture('en'), { AppText } = load('components/ui/core.tsx');
  assert.match(renderToStaticMarkup(React.createElement(AppText, null, 'unchanged')), /dir="auto"/);
  assert.match(renderToStaticMarkup(React.createElement(AppText, { dir: 'rtl' }, '٢ قطع')), /dir="rtl"/);
});
test('ActionRow owns a single chevron direction, independent of missing or mismatched native RTL state', () => {
  const compiled = ts.transpileModule(fs.readFileSync('src/components/ui/core.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== 'object' ? [] : [node, ...nodes(node.props?.children)];
  for (const isRTL of [undefined, false, true]) {
    for (const rtl of [false, true]) {
      const exported = {};
      new Function('require', 'exports', compiled)(id => {
        if (id === 'react') return { ...React, useState: () => [false, () => {}], useContext: () => !rtl };
        if (id === 'react-native') return { I18nManager: { isRTL }, Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } };
        if (id === '@/theme/provider') return { useRemyTheme: () => ({ colors: {} }) };
        if (id === '@/theme/fonts') return { useRemyFonts: () => ({}) };
        if (id === '@/theme/tokens') return { spacing: {}, layout: {}, radii: {}, typography: {} };
        if (id === './icon') return { Icon: 'Icon' };
        return require(id);
      }, exported);
      const row = exported.ActionRow({ title: 'Row', rtl, onPress() {} });
      const chevron = nodes(row).filter(node => node.type === 'Icon' && node.props.name === 'chevron');
      assert.equal(chevron.length, 1); assert.equal(chevron[0].props.rtl, rtl);
      assert(!nodes(row).some(node => node.type === 'View' && node.props.style?.transform));
      const custom = exported.ActionRow({ title: 'Row', rtl, onPress() {}, trailing: 'custom' });
      assert(!nodes(custom).some(node => node.type === 'Icon' && node.props.name === 'chevron'));
    }
  }
});
