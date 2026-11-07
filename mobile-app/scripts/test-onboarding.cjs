const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { defaultAnswers, validAnswers, validRecord, toggleOption, MAX_GOALS, MAX_RECIPES } = require('../src/domain/onboarding.ts');
const { OnboardingStore, ONBOARDING_KEY } = require('../src/repositories/onboarding-store.ts');
const { onboardingMessages } = require('../src/i18n/onboarding.ts');
function storage(initial) { const data = new Map(initial ? [[ONBOARDING_KEY, initial]] : []); return { data, fail: false, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { if (this.fail) throw new Error('write'); data.set(key, value); } }; }
const uuid = '0b7c5d1e-8f43-4e2a-9d6b-3a1f2e4c5b6d';

test('answers: household range, backend diet values, goal and recipe caps, no duplicates', () => {
  assert.ok(validAnswers(defaultAnswers)); assert.ok(validAnswers({ ...defaultAnswers, diets: ['HALAL', 'VEGAN'], recipeIds: [uuid] }));
  for (const bad of [{ householdSize: 0 }, { householdSize: 7 }, { diets: ['keto'] }, { diets: ['VEGAN', 'VEGAN'] }, { goals: ['quick', 'healthy', 'budget'] }, { recipeIds: Array.from({ length: MAX_RECIPES + 1 }, (_, i) => `r${i}`) }, { recipeIds: ['../x'] }, { extra: 1 }])
    assert.equal(validAnswers({ ...defaultAnswers, ...bad }), false, JSON.stringify(bad));
  assert.deepEqual(toggleOption(['quick', 'healthy'], 'budget', MAX_GOALS), ['quick', 'healthy']);
  assert.deepEqual(toggleOption(['quick', 'healthy'], 'quick', MAX_GOALS), ['healthy']);
});

test('store: first run has no record; completion persists across restart; failed write and corrupt data never mark onboarding done', async () => {
  const memory = storage(), store = new OnboardingStore(memory); await store.hydrate();
  assert.deepEqual(store.getSnapshot(), { record: null, status: 'ready' });
  const answers = { ...defaultAnswers, diets: ['HALAL'], recipeIds: [uuid] }; await store.complete(answers, false);
  const restarted = new OnboardingStore(memory); await restarted.hydrate(); assert.deepEqual(restarted.getSnapshot().record.answers, answers);
  assert.ok(validRecord(JSON.parse(memory.data.get(ONBOARDING_KEY))));
  const failing = storage(); failing.fail = true; const unsaved = new OnboardingStore(failing); await unsaved.hydrate(); await assert.rejects(unsaved.complete(answers, true)); assert.equal(unsaved.getSnapshot().record, null);
  for (const raw of ['bad JSON', '{"version":2}']) { const broken = storage(raw), corrupt = new OnboardingStore(broken); await corrupt.hydrate(); assert.equal(corrupt.getSnapshot().status, 'error'); assert.equal(broken.data.get(ONBOARDING_KEY), raw); }
});

test('onboarding copy has English/Arabic parity and labels every backend diet', () => {
  assert.deepEqual(Object.keys(onboardingMessages.en).sort(), Object.keys(onboardingMessages.ar).sort());
  for (const text of Object.values(onboardingMessages.ar)) assert.match(text, /[؀-ۿ]/u);
  for (const diet of require('../src/domain/onboarding.ts').diets) assert.ok(onboardingMessages.en[diet]);
});
