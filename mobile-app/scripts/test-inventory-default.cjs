const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { BackendKitchenStore, visibleBackendKitchen, emptyBackendKitchen } = require('../src/repositories/backend-kitchen-store.ts');
const { AuthStore } = require('../src/repositories/auth-store.ts');
const { BackendError } = require('../src/services/backend-core.ts');

function provider(auth, store) {
  const exported = {};
  const output = ts.transpileModule(fs.readFileSync('src/providers/backend-kitchen-provider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', output)(id => {
    if (id === 'react') return { createContext: () => ({}), useContext: () => store, useSyncExternalStore: (_subscribe, get) => get() };
    if (id === '@/repositories/backend-kitchen-store') return { BackendKitchenStore, visibleBackendKitchen };
    if (id === './auth-provider') return { useAuth: () => ({ ...auth.getSnapshot(), restore: auth.restore }) };
    if (id === '@/services/inventory-feature') return require('../src/services/inventory-feature.ts');
    return {};
  }, exported);
  return exported;
}

test('cold/resumed session with unreachable backend shows Kitchen error + retry, then recovers', async () => {
  let offline = true;
  const auth = new AuthStore(() => ({ me: async () => { if (offline) throw new BackendError('Offline'); return { id: 'user' }; } }));
  const store = new BackendKitchenStore(() => ({ list: async () => ({ items: [], today: '2026-10-30' }) }));
  const ui = provider(auth, store);
  await auth.restore();
  assert.equal(auth.getSnapshot().error, 'connectionError');
  const state = ui.useBackendKitchen();
  assert.equal(state.status, 'error');
  assert.deepEqual(state.items, []);
  offline = false; await state.retry();
  assert.equal(auth.getSnapshot().user.id, 'user');
  store.setUser('user'); await store.reload();
  assert.equal(ui.useBackendKitchen().status, 'ready');
});
test('genuine signed-out state stays signed out, including an offline logout', async () => {
  const auth = new AuthStore(() => ({ me: async () => { throw { code: 'NO_SESSION' }; }, logout: async () => { throw new Error('Offline'); } }));
  const store = new BackendKitchenStore(() => assert.fail('Must not read while signed out'));
  await auth.restore();
  assert.equal(provider(auth, store).useBackendKitchen().status, 'signed-out');
  await auth.logout();
  assert.equal(provider(auth, store).useBackendKitchen().status, 'signed-out');
  assert.deepEqual(store.getSnapshot(), emptyBackendKitchen);
});
