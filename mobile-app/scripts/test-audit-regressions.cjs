const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
};

test('regression: FeaturePreview passes rtl={rtl} to back button in fallback preview screens', () => {
  const code = fs.readFileSync('src/screens/feature-preview-screen.tsx', 'utf8');
  assert.match(code, /<Button label=\{a\.backMore\} icon="back" rtl=\{rtl\} variant="text"/);
});

test('regression: ShoppingScreen modal styles category validation error with errorText color', () => {
  const code = fs.readFileSync('src/screens/shopping-screen.tsx', 'utf8');
  assert.match(code, /\{errors\.category && <AppText accessibilityRole="alert" style=\{\{ color: colors\.errorText \}\}>\{t\[errors\.category\]\}<\/AppText>\}/);
});

test('regression: HomeScreen recipe modal Card has explicit direction: rtl ? "rtl" : "ltr"', () => {
  const code = fs.readFileSync('src/screens/home-screen.tsx', 'utf8');
  assert.match(code, /Card accessibilityViewIsModal style=\{\{[^}]*direction:\s*rtl \? 'rtl' : 'ltr'/);
});

test('regression: Route contracts verify all navigation destinations exist in src/app', () => {
  const routes = [
    'src/app/(tabs)/_layout.tsx',
    'src/app/(tabs)/index.tsx',
    'src/app/(tabs)/kitchen.tsx',
    'src/app/(tabs)/add.tsx',
    'src/app/(tabs)/health.tsx',
    'src/app/(tabs)/more.tsx',
    'src/app/_layout.tsx',
    'src/app/food/[id].tsx',
    'src/app/food/manual.tsx',
    'src/app/food/edit/[id].tsx',
    'src/app/recipes/[id].tsx',
    'src/app/cooking/[id].tsx',
    'src/app/feature.tsx',
    'src/app/receipt.tsx',
    'src/app/food-entry.tsx',
  ];
  for (const route of routes) {
    assert.ok(fs.existsSync(route), `Route file ${route} must exist`);
  }
});
