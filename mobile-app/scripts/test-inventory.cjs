// Uses Node's built-in test runner and the project's existing TypeScript compiler.
// No application storage is touched: repositories use an injected in-memory adapter.
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(result.outputText, filename);
};
const domain = require('../src/domain/inventory.ts');
const { StoredInventoryRepository, INVENTORY_KEY } = require('../src/repositories/inventory-repository.ts');
const { InventoryStore } = require('../src/repositories/inventory-store.ts');
const validDraft = { ...domain.emptyDraft, name: ' Spinach ', categoryId: 'produce', quantity: '150', unitId: 'g', storageId: 'refrigerator' };
const validInput = () => domain.validateDraft(validDraft).value;
const { foodEntryMessages, localizedFoodErrors, localizedInventoryError } = require('../src/i18n/food-entry.ts');
const { inventoryMessages } = require('../src/i18n/inventory.ts');
const { homeUnitLabels } = require('../src/i18n/home.ts');

test('Add Food catalogs have matching nonempty English/Arabic labels and stable option IDs', () => {
  assert.deepEqual(Object.keys(foodEntryMessages.en).sort(), Object.keys(foodEntryMessages.ar).sort());
  for (const key of Object.keys(foodEntryMessages.en)) {
    assert.ok(foodEntryMessages.en[key].trim(), key);
    assert.match(foodEntryMessages.ar[key], /[\u0600-\u06ff]/u, key);
  }
  for (const language of ['en', 'ar']) {
    for (const { id } of [...domain.categoryOptions, ...domain.storageOptions]) assert.ok(inventoryMessages[language][id]);
    for (const { id } of domain.unitOptions) assert.ok(homeUnitLabels[language][id]);
  }
  assert.equal(foodEntryMessages.en.manual, 'Add Manually');
  assert.equal(foodEntryMessages.ar.deleteTitle, 'هل تريد حذف هذا الطعام؟');
});

test('localized validation follows unchanged rules and translates existing errors on language changes', () => {
  const draft = { ...domain.emptyDraft, purchaseDate: 'invalid', expirationDate: 'invalid', notes: 'x'.repeat(1001) };
  const result = domain.validateDraft(draft);
  for (const language of ['en', 'ar']) {
    const errors = localizedFoodErrors(result.errors, draft, language);
    assert.deepEqual(Object.keys(errors).sort(), Object.keys(result.errors).sort());
    for (const message of Object.values(errors)) assert.ok(Object.values(foodEntryMessages[language]).includes(message));
  }
  for (const quantity of ['١٥٠', '۱۵۰', '0,5', '٠٫٥']) {
    const numericDraft = { ...validDraft, quantity };
    const errors = domain.validateDraft(numericDraft).errors;
    assert.ok(errors.quantity);
    assert.equal(localizedFoodErrors(errors, numericDraft, 'ar').quantity, foodEntryMessages.ar.quantityError);
    assert.match(foodEntryMessages.ar.quantityError, /0–9/);
  }
  const reversed = { ...validDraft, purchaseDate: '2026-10-14', expirationDate: '2026-10-13' };
  const errors = domain.validateDraft(reversed).errors;
  assert.equal(localizedFoodErrors(errors, reversed, 'ar').expirationDate, foodEntryMessages.ar.dateOrder);
  assert.equal(localizedFoodErrors(errors, reversed, 'en').expirationDate, foodEntryMessages.en.dateOrder);
  assert.deepEqual(localizedFoodErrors({ name: undefined }, validDraft, 'ar'), {});
  assert.ok(domain.validateDraft({ ...validDraft, quantity: '1e-7' }).value);
});

test('inventory failure presentation never exposes untranslated errors and updates with language', () => {
  const cases = [
    ['This item no longer exists. Return to Kitchen.', 'missingError'],
    ['The food details are invalid. Review the form before saving.', 'invalidError'],
    ['Inventory must finish loading successfully before changes can be saved.', 'loadingError'],
    ['Could not save inventory. Your current data has not changed. Check device storage and retry.', 'saveError'],
    ['Unexpected storage failure', 'saveError'],
  ];
  for (const [message, key] of cases) for (const language of ['en', 'ar']) assert.equal(localizedInventoryError(message, language), foodEntryMessages[language][key]);
});

test('chooser, create/edit, details and deletion UI react to the shared language without changing draft IDs', async () => {
  let language = 'en';
  const item = { ...validInput(), id: 'saved_food', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' };
  const core = Object.fromEntries(['ActionRow', 'AppText', 'Button', 'Card', 'PageHeader', 'Screen', 'SectionHeader', 'Chip', 'EmptyState', 'ScreenDirectionProvider'].map((name) => [name, name]));
  core.uiStyles = { wrap: {}, row: {} };
  const native = Object.fromEntries(['View', 'Modal', 'ScrollView', 'KeyboardAvoidingView', 'TextInput'].map((name) => [name, name]));
  Object.assign(native, { Platform: { OS: 'web' }, AccessibilityInfo: {}, Keyboard: {}, BackHandler: {} });
  const mocks = {
    react: { ...require('react'), useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useEffect: () => {}, useRef: (current) => ({ current }) },
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: {}, Stack: { Screen: 'StackScreen' }, useLocalSearchParams: () => ({ id: item.id }), useNavigation: () => ({}), usePreventRemove: () => () => {} },
    '@/providers/language-provider': { useLanguage: () => ({ language }) },
    '@/providers/inventory-provider': { useInventory: () => ({ items: [item], status: 'ready', createItem: () => {}, updateItem: () => {} }) },
    '@/theme/provider': { useRemyTheme: () => ({ colors: {} }) },
    '@/theme/fonts': { useRemyFonts: () => ({}) },
    '@/theme/tokens': { spacing: {}, radii: {}, layout: {} },
    '@/components/ui/core': core, './core': core,
    '@/components/food-photo-field': { FoodPhotoField: 'FoodPhotoField' },
    '@/components/managed-food-photo': { ManagedFoodPhoto: 'ManagedFoodPhoto' },
    '@/components/ui/form-field': { FormField: 'FormField', FieldGroup: 'FieldGroup' },
    '@/components/inventory-notice': { InventoryNotice: 'InventoryNotice' },
    '@/components/expiration-label': { ExpirationLabel: 'ExpirationLabel' },
    '@/components/ui/confirm-dialog': { ConfirmDialog: 'ConfirmDialog' },
    '@/domain/inventory': domain,
    '@/i18n/food-entry': { foodEntryMessages, localizedFoodErrors, localizedInventoryError },
    '@/i18n/inventory': { inventoryMessages }, '@/i18n/home': { homeUnitLabels },
  };
  function load(file) {
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)((id) => mocks[id] ?? require(id), exports);
    return exports;
  }
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  const chooser = load('src/screens/food-entry-chooser.tsx').default;
  const form = load('src/screens/food-form-screen.tsx').default;
  const details = load('src/screens/food-detail-screen.tsx').default;
  const dialog = load('src/components/ui/confirm-dialog.tsx').ConfirmDialog;
  const input = load('src/components/ui/form-field.tsx').FormField;
  for (language of ['en', 'ar', 'en']) {
    const t = foodEntryMessages[language];
    const rtl = language === 'ar';
    const choices = nodes(chooser());
    assert.equal(choices.find((node) => node.type === 'Screen').props.rtl, rtl);
    assert.ok(choices.some((node) => node.props?.label === t.manual));
    const photoActions=nodes(choices.find(node=>node.type==='FoodPhotoField').props.Actions({takePhoto(){},choosePhoto(){},busy:false}));assert.deepEqual([...photoActions,...choices].filter((node) => node.type === 'ActionRow').map((node) => [node.props.title, node.props.disabled, node.props.rtl]), [[t.camera, false, rtl], [t.gallery, false, rtl], [t.receipt, false, rtl]]);
    for (const itemId of [undefined, item.id]) {
      const formElement = nodes(form({ itemId })).find((node) => typeof node.type === 'function');
      const fields = nodes(formElement.type(formElement.props));
      assert.equal(fields.find((node) => node.type === 'Screen').props.rtl, rtl);
      assert.equal(fields.find((node) => node.type === 'PageHeader').props.title, itemId ? t.edit : t.add);
      assert.ok(fields.some((node) => node.props?.label === (itemId ? t.saveChanges : t.save)));
      const chips = fields.filter((node) => node.type === 'Chip');
      assert.ok(chips.some((node) => node.props.label === inventoryMessages[language].produce));
      if (itemId) assert.equal(chips.find((node) => node.key === 'produce').props.selected, true);
    }
    const detailNodes = nodes(details());
    assert.ok(detailNodes.some((node) => node.props?.label === t.edit));
    const back = detailNodes.find((node) => node.props?.icon === 'back');
    assert.equal(back.props.rtl, rtl);
    const dialogNodes = nodes(dialog({ visible: true, name: item.name, busy: true, onCancel() {}, onConfirm() {} }));
    assert.equal(dialogNodes[0].props.value, rtl);
    assert.ok(dialogNodes.some((node) => node.props?.label === t.deleting));
    const textInput = nodes(input({ label: t.quantity, value: '150', inputDirection: 'ltr' })).find((node) => node.type === 'TextInput');
    assert.equal(textInput.props.style.textAlign, rtl ? 'right' : 'left');
    assert.equal(textInput.props.style.writingDirection, 'ltr');
  }

  // Exercise the actual form handlers with persistent mocked hooks, without touching app storage.
  const formComponent = nodes(form({})).find((node) => typeof node.type === 'function').type;
  let state = [], refs = [], cursor = 0, refCursor = 0, queuedEffects = [], announcements = [], saves = 0;
  let rejectSave;
  mocks.react.useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  };
  mocks.react.useRef = (current) => refs[refCursor++] ?? (refs[refCursor - 1] = { current });
  mocks.react.useEffect = (effect, deps) => { if (deps[0]?.field) queuedEffects.push(effect); };
  native.Keyboard.dismiss = () => {};
  native.AccessibilityInfo.announceForAccessibility = (message) => announcements.push(message);
  mocks['@/theme/tokens'].spacing.md = 12;
  mocks['@/providers/inventory-provider'].useInventory = () => ({
    createItem: () => { saves++; return new Promise((resolve, reject) => { rejectSave = reject; }); }, updateItem: () => {},
  });
  const render = (editItem) => { cursor = 0; refCursor = 0; queuedEffects = []; return nodes(formComponent({ item: editItem })); };
  const field = (tree, label) => tree.find((node) => node.type === 'FormField' && node.props.label === label);
  const disclosure = (tree, label) => tree.find((node) => typeof node.type === 'function' && node.props.label === label);
  language = 'en';
  const t = foodEntryMessages.en;
  let tree = render();
  assert.equal(disclosure(tree, t.optionalDetails).props.expanded, false);
  assert.equal(field(tree, t.purchase), undefined);
  disclosure(tree, t.optionalDetails).props.onPress();
  tree = render();
  field(tree, t.purchase).props.onChangeText('2026-02-30');
  field(tree, t.notesOptional).props.onChangeText('Keep this draft');
  disclosure(tree, t.optionalDetails).props.onPress();
  tree = render();
  assert.equal(field(tree, t.purchase), undefined);
  disclosure(tree, t.optionalDetails).props.onPress();
  tree = render();
  assert.equal(field(tree, t.purchase).props.value, '2026-02-30');
  assert.equal(field(tree, t.notesOptional).props.value, 'Keep this draft');
  field(tree, t.name + ' *').props.onChangeText('Spinach');
  field(tree, t.quantity + ' *').props.onChangeText('150');
  tree.find((node) => node.type === 'Chip' && node.key === 'produce').props.onPress();
  tree.find((node) => node.type === 'Chip' && node.key === 'refrigerator').props.onPress();
  disclosure(tree, t.chooseUnit).props.onPress();
  tree = render();
  assert.deepEqual(tree.filter((node) => node.type === 'Chip' && domain.unitOptions.some(({ id }) => id === node.key)).map((node) => node.key), domain.unitOptions.map(({ id }) => id));
  tree.find((node) => node.type === 'Chip' && node.key === 'g').props.onPress();
  tree = render();
  assert.equal(disclosure(tree, homeUnitLabels.en.g).props.expanded, false);
  disclosure(tree, t.optionalDetails).props.onPress();
  tree = render();
  tree.find((node) => node.type === 'Button' && node.props.label === t.save).props.onPress();
  tree = render();
  assert.equal(saves, 0);
  assert.equal(disclosure(tree, t.optionalDetails).props.expanded, true);
  assert.equal(field(tree, t.purchase).props.error, t.dateError);
  assert.equal(announcements.at(-1), t.dateError);
  let focusCount = 0, scrollPosition;
  tree.find((node) => node.type === 'Screen').props.scrollRef.current = { scrollTo: (position) => { scrollPosition = position; } };
  field(tree, t.purchase).props.inputRef({ focus: () => focusCount++ });
  tree.filter((node) => node.type === 'View' && node.props.onLayout).forEach((node, index) => node.props.onLayout({ nativeEvent: { layout: { y: 100 + index * 50 } } }));
  const oldFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = (callback) => { callback(); return 1; };
  try { queuedEffects.forEach((effect) => effect()); } finally { global.requestAnimationFrame = oldFrame; }
  assert.equal(focusCount, 1);
  assert.ok(scrollPosition.y > 0);
  field(tree, t.purchase).props.onChangeText('2026-02-28');
  tree = render();
  const save = tree.find((node) => node.type === 'Button' && node.props.label === t.save);
  save.props.onPress(); save.props.onPress();
  assert.equal(saves, 1);
  tree = render();
  assert.equal(tree.find((node) => node.type === 'Button' && node.props.label === t.saving).props.disabled, true);
  rejectSave(new Error('Storage failure'));
  await new Promise((resolve) => setImmediate(resolve));
  tree = render();
  assert.equal(field(tree, t.name + ' *').props.value, 'Spinach');
  assert.ok(tree.some((node) => node.props?.children === t.saveError));
  language = 'ar';
  tree = render();
  assert.ok(tree.some((node) => node.props?.children === foodEntryMessages.ar.saveError));
  assert.equal(field(tree, foodEntryMessages.ar.name + ' *').props.value, 'Spinach');
  state = []; refs = [];
  tree = render({ ...item, notes: 'Previously saved notes' });
  assert.equal(disclosure(tree, foodEntryMessages.ar.optionalDetails).props.expanded, true);
  assert.equal(field(tree, foodEntryMessages.ar.notesOptional).props.value, 'Previously saved notes');
});
function storage() {
  const data = new Map();
  return {
    data, readFailure: false, writeFailure: false, writes: 0,
    async getItem(key) { if (this.readFailure) throw new Error('read failure'); return data.get(key) ?? null; },
    async setItem(key, value) { if (this.writeFailure) throw new Error('write failure'); this.writes++; data.set(key, value); },
  };
}

test('draft validation trims content and rejects invalid fields', () => {
  assert.equal(validInput().name, 'Spinach');
  for (const value of ['', '0', '-1', 'NaN', 'Infinity', '0x10', '3garbage', '1e999']) assert.ok(domain.validateDraft({ ...validDraft, quantity: value }).errors.quantity, value);
  for (const field of ['categoryId', 'storageId', 'unitId']) assert.ok(domain.validateDraft({ ...validDraft, [field]: 'unsupported' }).errors[field]);
  assert.ok(domain.validateDraft({ ...validDraft, name: '   ' }).errors.name);
  assert.ok(domain.validateDraft({ ...validDraft, name: 'x'.repeat(101) }).errors.name);
  assert.ok(domain.validateDraft({ ...validDraft, notes: 'x'.repeat(1001) }).errors.notes);
  for (const value of ['0.5', '.5', '1e-7', '5e-324']) assert.ok(domain.validateDraft({ ...validDraft, quantity: value }).value);
});
test('dates are calendar-valid and historical dates remain accepted', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001-01-01', '2026-10-14']) assert.equal(domain.isCalendarDate(date), true, date);
  for (const date of ['1900-02-29', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '0000-01-01', ' 2026-10-14']) assert.equal(domain.isCalendarDate(date), false, date);
  assert.ok(domain.validateDraft({ ...validDraft, purchaseDate: '2020-01-01', expirationDate: '2020-01-02' }).value);
  assert.ok(domain.validateDraft({ ...validDraft, purchaseDate: '2026-10-14', expirationDate: '2026-10-13' }).errors.expirationDate);
  assert.ok(domain.validateDraft({ ...validDraft, expirationDate: '2026-02-30' }).errors.expirationDate);
});
test('empty first launch stays separate from demo inventory; hydration gates writes', async () => {
  const memory = storage();
  const store = new InventoryStore(new StoredInventoryRepository(memory));
  await assert.rejects(store.create(validInput()));
  await store.hydrate();
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().items, []);
  assert.equal(memory.writes, 0);
});
test('concurrent mutations serialize and subscribers see successful saved changes', async () => {
  const memory = storage();
  const store = new InventoryStore(new StoredInventoryRepository(memory));
  await store.hydrate();
  let publications = 0;
  const unsubscribe = store.subscribe(() => publications++);
  const added = await Promise.all([store.create(validInput()), store.create({ ...validInput(), name: 'Rice' }), store.create({ ...validInput(), name: 'Oats' })]);
  assert.equal(store.getSnapshot().items.length, 3);
  assert.equal(new Set(added.map((item) => item.id)).size, 3);
  assert.equal(JSON.parse(memory.data.get(INVENTORY_KEY)).items.length, 3);
  assert.equal(store.getSnapshot().pendingWrites, 0);
  assert.ok(publications >= 3);
  unsubscribe();
});
test('a pending write does not publish unsaved inventory', async () => {
  const memory = storage();
  let release;
  memory.setItem = async (key, value) => { await new Promise((resolve) => { release = resolve; }); memory.data.set(key, value); };
  const store = new InventoryStore(new StoredInventoryRepository(memory));
  await store.hydrate();
  const mutation = store.create(validInput());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().pendingWrites, 1);
  release();
  await mutation;
  assert.equal(store.getSnapshot().items.length, 1);
});
test('edit retains identity and creation time; restart restores saved edits/deletion', async () => {
  const memory = storage();
  const repo = new StoredInventoryRepository(memory);
  const store = new InventoryStore(repo);
  await store.hydrate();
  const item = await store.create(validInput());
  const edited = await store.update(item.id, { ...validInput(), name: 'Baby spinach', notes: 'For lunch' });
  assert.equal(edited.id, item.id);
  assert.equal(edited.createdAt, item.createdAt);
  assert.ok(edited.updatedAt >= item.updatedAt);
  const restarted = new InventoryStore(repo);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().items, [edited]);
  await restarted.delete(item.id);
  const afterDelete = new InventoryStore(repo);
  await afterDelete.hydrate();
  assert.deepEqual(afterDelete.getSnapshot().items, []);
  await assert.rejects(afterDelete.update(item.id, validInput()));
});
test('failed create/edit/delete preserve data and queue recovers on retry', async () => {
  const memory = storage();
  const store = new InventoryStore(new StoredInventoryRepository(memory));
  await store.hydrate();
  memory.writeFailure = true;
  await assert.rejects(store.create(validInput()));
  assert.equal(store.getSnapshot().items.length, 0);
  memory.writeFailure = false;
  const item = await store.create(validInput());
  const raw = memory.data.get(INVENTORY_KEY);
  memory.writeFailure = true;
  await assert.rejects(store.update(item.id, { ...validInput(), name: 'Changed' }));
  await assert.rejects(store.delete(item.id));
  assert.deepEqual(store.getSnapshot().items, [item]);
  assert.equal(memory.data.get(INVENTORY_KEY), raw);
  assert.equal(store.getSnapshot().error.operation, 'write');
  assert.equal(store.getSnapshot().pendingWrites, 0);
  memory.writeFailure = false;
  await store.delete(item.id);
  assert.equal(store.getSnapshot().error, null);
});
test('malformed/unsupported/duplicate saved data stays untouched and blocks writes', async () => {
  const memory = storage();
  const goodStore = new InventoryStore(new StoredInventoryRepository(memory));
  await goodStore.hydrate();
  const good = await goodStore.create(validInput());
  const invalid = ['broken JSON', JSON.stringify({ version: 3, items: [] }), JSON.stringify({ version: 1, items: [{ ...good, expirationDate: '2026-02-30' }] }), JSON.stringify({ version: 1, items: [good, good] }), JSON.stringify({ version: 1, items: [{ ...good, quantity: -1 }] }), JSON.stringify({ version: 1, items: [{ ...good, createdAt: 'not-a-timestamp' }] })];
  for (const raw of invalid) {
    memory.data.set(INVENTORY_KEY, raw);
    const writes = memory.writes;
    const store = new InventoryStore(new StoredInventoryRepository(memory));
    await store.hydrate();
    assert.equal(store.getSnapshot().status, 'error');
    await assert.rejects(store.create(validInput()));
    assert.equal(memory.writes, writes);
    assert.equal(memory.data.get(INVENTORY_KEY), raw);
    memory.data.set(INVENTORY_KEY, JSON.stringify({ version: 1, items: [good] }));
    await store.hydrate();
    assert.deepEqual(store.getSnapshot().items, [good]);
  }
});
test('read failure is recoverable and cannot trigger an empty write', async () => {
  const memory = storage();
  memory.readFailure = true;
  const store = new InventoryStore(new StoredInventoryRepository(memory));
  await store.hydrate();
  assert.equal(store.getSnapshot().error.operation, 'read');
  await assert.rejects(store.create(validInput()));
  assert.equal(memory.writes, 0);
  memory.readFailure = false;
  await store.hydrate();
  assert.equal(store.getSnapshot().status, 'ready');
});
test('Use First handles unknown, past, due and upcoming dates; filters use stable IDs', () => {
  const base = { ...validInput(), id: 'test', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' };
  const items = [base, { ...base, id: 'later', expirationDate: '2026-10-20' }, { ...base, id: 'soon', expirationDate: '2026-10-16' }, { ...base, id: 'past', expirationDate: '2026-10-12' }, { ...base, id: 'today', expirationDate: '2026-10-14' }];
  assert.equal(domain.expirationStatus(base, '2026-10-14').kind, 'unknown');
  assert.deepEqual(domain.useFirstItems(items, '2026-10-14').map((item) => item.id), ['past', 'today', 'soon']);
  assert.equal(domain.filterInventory(items, ' SPINACH ', 'produce', 'refrigerator').length, 5);
  assert.equal(domain.filterInventory(items, '', 'protein', 'pantry').length, 0);
});

test('Version 1 reads never rewrite and explicit mutations write Version 2 without changing existing identity', async () => {
 const memory = storage(); const old = { ...validInput(), id: 'legacy', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' };
 const raw = JSON.stringify({ version: 1, items: [old] }); memory.data.set(INVENTORY_KEY, raw);
 const store = new InventoryStore(new StoredInventoryRepository(memory)); await store.hydrate();
 assert.equal(memory.writes, 0); assert.equal(memory.data.get(INVENTORY_KEY), raw); assert.deepEqual(store.getSnapshot().items, [old]);
 memory.writeFailure = true; await assert.rejects(store.create(validInput())); assert.equal(memory.data.get(INVENTORY_KEY), raw);
 memory.writeFailure = false; await store.create({ ...validInput(), photoRef: 'photo_test.jpg' });
 assert.equal(JSON.parse(memory.data.get(INVENTORY_KEY)).version, 2); assert.deepEqual(store.getSnapshot().items[0], old);
 const restart = new InventoryStore(new StoredInventoryRepository(memory)); await restart.hydrate(); assert.equal(restart.getSnapshot().items[1].photoRef, 'photo_test.jpg');
});
test('Version 2 rejects unsafe photo references and Version 1 rejects added photo fields', async () => {
 const memory=storage(); const item={...validInput(), id:'photoitem', createdAt:'2026-10-14T00:00:00.000Z', updatedAt:'2026-10-14T00:00:00.000Z'};
 for(const photoRef of [null, '', '../photo.jpg', 'file:///tmp/a.jpg', 'blob:test', 'data:image/png;base64,test', 'photo_test.exe']) assert.equal(domain.isInventoryItem({...item,photoRef}),false);
 for(const envelope of [{version:1,items:[{...item,photoRef:'photo_ok.jpg'}]}, {version:2,items:[{...item,photoRef:'../photo.jpg'}]}]) { const raw=JSON.stringify(envelope); memory.data.set(INVENTORY_KEY,raw); await assert.rejects(new StoredInventoryRepository(memory).read()); assert.equal(memory.data.get(INVENTORY_KEY),raw); }
});

test('photo replacement/removal cleanup occurs only after commit and never deletes shared references', async () => {
 const memory=storage(); const files=new Set(['photo_old.jpg','photo_new.jpg']); const removed=[];
 const photos={async resolve(ref){return files.has(ref)?'file:///'+ref:null;},release(){},async remove(ref){assert.ok(!JSON.parse(memory.data.get(INVENTORY_KEY)).items.some(item=>item.photoRef===ref));removed.push(ref);files.delete(ref);}};
 const store=new InventoryStore(new StoredInventoryRepository(memory),photos); await store.hydrate();
 const a=await store.create({...validInput(),photoRef:'photo_old.jpg'});const b=await store.create({...validInput(),photoRef:'photo_old.jpg'});
 memory.writeFailure=true;await assert.rejects(store.update(a.id,{...validInput(),photoRef:'photo_new.jpg'}));await assert.rejects(store.delete(a.id));assert.deepEqual(removed,[]);assert.equal(store.getSnapshot().items[0].photoRef,'photo_old.jpg');
 memory.writeFailure=false;await store.update(a.id,{...validInput(),photoRef:'photo_new.jpg'});assert.deepEqual(removed,[]);
 await store.update(b.id,validInput());assert.deepEqual(removed,['photo_old.jpg']);
 photos.remove=async()=>{throw new Error('cleanup denied');}; await store.update(a.id,validInput());assert.equal(store.getSnapshot().items[0].photoRef,undefined);assert.ok(files.has('photo_new.jpg'));assert.equal(store.getSnapshot().error,null);
 await assert.rejects(store.update(a.id,{...validInput(),photoRef:'photo_missing.jpg'}));assert.equal(store.getSnapshot().items[0].photoRef,undefined);
});
test('interrupted photo preparation leaves prior inventory intact and missing existing photos do not block hydration',async()=>{
 const memory=storage();const item={...validInput(),photoRef:'photo_missing.jpg',id:'old',createdAt:'2026-10-14T00:00:00.000Z',updatedAt:'2026-10-14T00:00:00.000Z'};
 const raw=JSON.stringify({version:2,items:[item]});memory.data.set(INVENTORY_KEY,raw);
 const photos={async resolve(){return null;},release(){},async remove(){}};const store=new InventoryStore(new StoredInventoryRepository(memory),photos);await store.hydrate();assert.equal(store.getSnapshot().status,'ready');assert.equal(memory.writes,0);
 await assert.rejects(store.update(item.id,{...validInput(),photoRef:'photo_interrupted.jpg'}));assert.equal(memory.data.get(INVENTORY_KEY),raw);
 await store.update(item.id,{...validInput(),photoRef:item.photoRef});assert.equal(store.getSnapshot().items[0].photoRef,item.photoRef);
 await store.update(item.id,validInput());assert.equal(store.getSnapshot().items[0].photoRef,undefined);
});
test('native photo storage copies to owned documents, resolves after restart and rejects arbitrary paths',async()=>{
 const files=new Map([['file:///cache/picked.jpg',123]]);let failCopy=false;
 class Directory{constructor(...parts){this.uri=parts.map(p=>p.uri??p).join('/');}create(){}}
 class File{constructor(...parts){this.uri=parts.map(p=>p.uri??p).join('/');}get exists(){return files.has(this.uri);}get size(){return files.get(this.uri)??0;}async copy(target){await new Promise(resolve=>setImmediate(resolve));if(failCopy)throw new Error('copy interrupted');files.set(target.uri,this.size);}delete(){files.delete(this.uri);}}
 const load=()=>{const exports={};const compiled=ts.transpileModule(fs.readFileSync('src/services/photo-storage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','exports',compiled)(id=>id==='expo-file-system'?{File,Directory,Paths:{document:'file:///documents'}}:id==='../domain/inventory'?domain:require(id),exports);return exports.photoStorage;};
 const storage=load();const ref=await storage.save('file:///cache/picked.jpg');assert.ok(domain.isPhotoRef(ref));assert.equal(await load().resolve(ref),'file:///documents/remy-food-photos/'+ref);files.delete('file:///cache/picked.jpg');assert.ok(await storage.resolve(ref));
 await assert.rejects(storage.remove('../picked.jpg'));assert.ok(await storage.resolve(ref));await storage.remove(ref);assert.equal(await storage.resolve(ref),null);
 files.set('file:///cache/large.jpg',21*1024*1024);await assert.rejects(storage.save('file:///cache/large.jpg'),/Photo too large/);files.set('file:///cache/picked.jpg',123);failCopy=true;await assert.rejects(storage.save('file:///cache/picked.jpg'));await assert.rejects(storage.save('file:///cache/missing.jpg'));
});

test('web photo adapter stores blobs under stable refs, waits for transactions, and releases temporary URLs', async () => {
 const data=new Map();let fail=false;const revoked=[];const db={createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {add(blob,ref){const request={};queueMicrotask(()=>{if(fail||data.has(ref)){tx.error=new Error('write denied');tx.onabort();}else{data.set(ref,blob);request.result=ref;tx.oncomplete();}});return request;},get(ref){const request={};queueMicrotask(()=>{request.result=data.get(ref);tx.oncomplete();});return request;},delete(ref){const request={};queueMicrotask(()=>{data.delete(ref);tx.oncomplete();});return request;}};}};return tx;}};
 const indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
 const exported={};const compiled=ts.transpileModule(fs.readFileSync('src/services/photo-storage.web.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports','indexedDB','fetch','URL',compiled)(id=>id==='../domain/inventory'?domain:require(id),exported,indexedDB,async()=>({ok:true,blob:async()=>new Blob(['photo'],{type:'image/jpeg'})}),{createObjectURL:()=> 'blob:preview',revokeObjectURL:uri=>revoked.push(uri)});
 const photos=exported.photoStorage;const ref=await photos.save('blob:picker');assert.ok(domain.isPhotoRef(ref));assert.ok(data.get(ref) instanceof Blob);assert.equal(await photos.resolve(ref),'blob:preview');photos.release('blob:preview');assert.deepEqual(revoked,['blob:preview']);
 fail=true;await assert.rejects(photos.save('blob:replacement'));assert.ok(data.has(ref));fail=false;await photos.remove(ref);assert.equal(await photos.resolve(ref),null);await assert.rejects(photos.remove('../unsafe'));
});
test('photo acquisition handles denied camera, cancellation and copy failures without replacing the draft', async () => {
 let states=[],cursor=0,permission=false,pickerResult={canceled:true},copyFails=false,calls=0;const changes=[],busy=[];const exported={};
 const compiled=ts.transpileModule(fs.readFileSync('src/components/food-photo-field.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const guard={current:false};const mocks={react:{useRef:()=>guard,useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],next=>states[index]=next];}},'react-native':{View:'View'},'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted:permission}),launchCameraAsync:async()=>{calls++;return pickerResult;},launchImageLibraryAsync:async()=>{calls++;return pickerResult;}},'@/services/photo-storage':{photoStorage:{save:async()=>{if(copyFails)throw new Error('copy failed');return 'photo_new.jpg';}}},'@/i18n/food-entry':{foodEntryMessages},'@/providers/language-provider':{useLanguage:()=>({language:'en'})},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/theme/tokens':{spacing:{}},'./ui/core':{AppText:'AppText',Button:'Button',uiStyles:{wrap:{}}},'./managed-food-photo':{ManagedFoodPhoto:'ManagedFoodPhoto'}};
 new Function('require','exports',compiled)(id=>mocks[id]??require(id),exported);
 function flatten(tree){if(Array.isArray(tree))return tree.flatMap(flatten);if(!tree||typeof tree!=='object')return [];return [tree,...flatten(tree.props?.children)];}
 const render=()=>{cursor=0;return flatten(exported.FoodPhotoField({photoRef:'photo_old.jpg',disabled:false,onChange:ref=>changes.push(ref),onBusy:value=>busy.push(value)}));};
 const press=async label=>{render().find(node=>node.type==='Button'&&node.props.label===label).props.onPress();await new Promise(resolve=>setImmediate(resolve));};
 await press(foodEntryMessages.en.takePhoto);assert.equal(calls,0);assert.ok(render().some(node=>node.props?.children===foodEntryMessages.en.photoPermission));
 await press(foodEntryMessages.en.replacePhoto);assert.deepEqual(changes,[]);
 pickerResult={canceled:false,assets:[{uri:'file:///picked.jpg'}]};copyFails=true;await press(foodEntryMessages.en.replacePhoto);assert.deepEqual(changes,[]);assert.ok(render().some(node=>node.props?.children===foodEntryMessages.en.photoStorageError));
 copyFails=false;pickerResult.assets[0].fileSize=40*1024*1024;await press(foodEntryMessages.en.replacePhoto);assert.deepEqual(changes,['photo_new.jpg']);permission=true;await press(foodEntryMessages.en.takePhoto);assert.deepEqual(changes,['photo_new.jpg','photo_new.jpg']);await press(foodEntryMessages.en.removePhoto);assert.deepEqual(changes,['photo_new.jpg','photo_new.jpg',undefined]);assert.equal(busy.at(-1),false);
});
test('managed photos show missing-file fallback and revoke resolved preview URLs on unmount',async()=>{
 let state=null,effect,cleanup,released=[];const exported={};const compiled=ts.transpileModule(fs.readFileSync('src/components/managed-food-photo.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 let uri=null;const mocks={react:{useState:()=>[state,next=>state=next],useEffect:callback=>effect=callback},'react-native':{View:'View'},'@/services/photo-storage':{photoStorage:{resolve:async()=>uri,release:value=>released.push(value)}},'@/providers/language-provider':{useLanguage:()=>({language:'en'})},'@/i18n/food-entry':{foodEntryMessages},'./food-image':{FoodImage:'FoodImage'},'./ui/core':{AppText:'AppText'}};
 new Function('require','exports',compiled)(id=>mocks[id]??require(id),exported);
 const render=()=>exported.ManagedFoodPhoto({photoRef:'photo_missing.jpg'});render();cleanup=effect();await new Promise(resolve=>setImmediate(resolve));assert.equal(render().props.children[0].props.uri,undefined);assert.equal(render().props.children[1].props.children,foodEntryMessages.en.photoUnavailable);cleanup();
 uri='blob:managed';render();cleanup=effect();await new Promise(resolve=>setImmediate(resolve));assert.equal(render().props.children[0].props.uri,uri);cleanup();assert.deepEqual(released,[uri]);
});

test('photo chooser requires explicit confirmation and passes a managed reference to the existing manual route',()=>{
 let state=[],cursor=0;const routes=[];const core=Object.fromEntries(['ActionRow','AppText','Button','Card','PageHeader','Screen','SectionHeader'].map(name=>[name,name]));const mocks={react:{useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],value=>state[index]=value];},useRef:()=>({current:false})},'expo-router':{router:{replace:route=>routes.push(route)}},'react-native':{View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/ui/core':core,'@/components/food-photo-field':{FoodPhotoField:'FoodPhotoField'},'@/theme/provider':{useRemyTheme:()=>({colors:{}})},'@/providers/language-provider':{useLanguage:()=>({language:'en'})},'@/i18n/food-entry':{foodEntryMessages},'@/theme/tokens':{spacing:{}}};const exported={};const code=ts.transpileModule(fs.readFileSync('src/screens/food-entry-chooser.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(id=>mocks[id]??require(id),exported);
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}const render=()=>{cursor=0;return nodes(exported.default());};let tree=render();assert.ok(!tree.some(node=>node.props?.label===foodEntryMessages.en.usePhoto));tree.find(node=>node.type==='FoodPhotoField').props.onChange('photo_confirmed.jpg');assert.deepEqual(routes,[]);tree=render();tree.find(node=>node.type==='Button'&&node.props.label===foodEntryMessages.en.usePhoto).props.onPress();assert.deepEqual(routes,[{pathname:'/food/manual',params:{photoRef:'photo_confirmed.jpg'}}]);
});

