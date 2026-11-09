const fs = require('node:fs'); const test = require('node:test'); const assert = require('node:assert/strict'); const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const r = require('../src/domain/nutrition-rings.ts'); const { shiftDate } = require('../src/domain/nutrition-dashboard.ts');
const day = (date, extra = {}) => ({ date, calories: 2000, proteinG: 120, carbsG: 200, fatG: 60, fiberG: 30, sugarG: 20, sodiumMg: 1500, mealCount: 3, ...extra });
const goal = { calorieTarget: 2000, proteinTargetG: 110 };

test('Fuel closes within 10% of the goal either side, never by eating less', () => {
  const closed = calories => r.ringsFor(day('2026-11-09', { calories }), goal)[0];
  assert.equal(closed(1850).closed, true); assert.equal(closed(2190).closed, true);
  assert.equal(closed(1500).closed, false); assert.equal(closed(0).closed, false);
  assert.deepEqual([closed(2400).closed, closed(2400).over], [false, true]);
});

test('without goals: Fuel counts meals and Protein uses 60 g; nothing logged is all open', () => {
  const [fuel, protein, fibre] = r.ringsFor(day('2026-11-09', { mealCount: 2, proteinG: 60, fiberG: 10 }), { calorieTarget: null, proteinTargetG: null });
  assert.deepEqual([fuel.target, fuel.closed, protein.target, protein.closed, fibre.closed], [3, false, 60, true, false]);
  assert.ok(r.ringsFor(null, goal).every(ring => !ring.closed && ring.progress === 0));
});

test('one missed day in seven is a rest day; two break the streak', () => {
  const today = '2026-11-09', ago = n => shiftDate(today, -n);
  const days = [0, 1, 2, 4, 5, 6, 7].map(n => day(ago(n))); // day 3 missed
  assert.deepEqual(r.forgivingStreak(days, today), { days: 7, restUsed: true });
  const broken = [0, 1, 3, 5, 6].map(n => day(ago(n))); // days 2 and 4 missed, 2 days apart
  assert.equal(r.forgivingStreak(broken, today).days, 3);
  assert.deepEqual(r.forgivingStreak([day(ago(1))], today), { days: 1, restUsed: false }); // today still empty
  assert.equal(r.forgivingStreak([], today).days, 0);
});

test('awards track progress and sort earned first', () => {
  const days = Array.from({ length: 8 }, (_, i) => day(shiftDate('2026-11-09', -i)));
  const list = r.awards(days, goal); const by = id => list.find(a => a.id === id);
  assert.equal(by('streak-7').earned, true); assert.deepEqual([by('streak-30').have, by('streak-30').earned], [8, false]);
  assert.equal(by('balanced-week').earned, true); assert.equal(by('meals-100').have, 24);
  assert.equal(list[0].earned, true); assert.equal(list.at(-1).earned, false);
  assert.ok(r.awards([], goal).every(a => !a.earned && a.have === 0));
});
