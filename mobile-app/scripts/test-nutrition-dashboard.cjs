const fs = require('node:fs'); const test = require('node:test'); const assert = require('node:assert/strict'); const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const d = require('../src/domain/nutrition-dashboard.ts');
const day = (date, calories, extra = {}) => ({ date, calories, proteinG: 100, carbsG: 200, fatG: 50, fiberG: 20, sugarG: 30, sodiumMg: 1500, mealCount: 3, ...extra });

test('periods end today and run oldest first', () => {
  assert.deepEqual(d.periodDates('2026-11-09', 'today'), ['2026-11-09']);
  assert.deepEqual(d.periodDates('2026-11-09', 'week'), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
  assert.equal(d.periodDates('2026-03-01', 'month')[0], '2026-01-31');
});

test('averages use logged days only; days on target are within 10%', () => {
  const all = [day('2026-11-07', 1900), day('2026-11-08', 2500), day('2026-11-09', 0, { mealCount: 0 })];
  const s = d.summarize(all, d.periodDates('2026-11-09', 'week'), { calorieTarget: 2000, proteinTargetG: null });
  assert.equal(s.logged.length, 2); assert.equal(s.average.calories, 2200); assert.equal(s.meals, 6);
  assert.equal(s.onTarget, 1); assert.equal(s.best.date, '2026-11-07');
  assert.equal(s.days.filter(x => x === null).length, 5);
  assert.equal(d.summarize(all, ['2026-11-09'], { calorieTarget: null, proteinTargetG: null }).onTarget, null);
});

test('a streak survives an empty today and stops at a gap', () => {
  const all = [day('2026-11-05', 1), day('2026-11-07', 1), day('2026-11-08', 1)];
  assert.equal(d.streak(all, '2026-11-09'), 2); assert.equal(d.streak(all, '2026-11-08'), 2); assert.equal(d.streak([], '2026-11-09'), 0);
});

test('energy split adds to 100 and is null with no food', () => {
  const share = d.energyShare({ proteinG: 100, carbsG: 200, fatG: 50 }); // 400 + 800 + 450 kcal
  assert.deepEqual(share, { protein: 24, carbs: 48, fat: 28 }); assert.equal(d.energyShare({ proteinG: 0, carbsG: 0, fatG: 0 }), null);
});

test('monthly averages cover 12 months and leave empty months empty', () => {
  const months = d.monthly([day('2026-11-02', 1800), day('2026-11-03', 2200), day('2026-01-10', 1500)], '2026-11-09');
  assert.equal(months.length, 12); assert.equal(months[0].month, '2025-12'); assert.equal(months[11].calories, 2000);
  assert.equal(months[1].calories, 1500); assert.equal(months[5].calories, null);
});

test('weight change counts from the last weight before the window', () => {
  const entries = [{ measuredAt: '2026-10-01T08:00:00Z', weightKg: 80 }, { measuredAt: '2026-11-04T08:00:00Z', weightKg: 79.2 }, { measuredAt: '2026-11-08T08:00:00Z', weightKg: 78.6 }];
  assert.deepEqual(d.weightTrend(entries, '2026-11-03').change, -1.4);
  assert.equal(d.weightTrend(entries, null).change, -1.4);
  assert.equal(d.weightTrend([entries[0]], '2026-11-03').change, null);
  assert.equal(d.weightTrend([], null), null);
});

test('BMI bands and round ticks', () => {
  assert.deepEqual(d.bmi(180, 81), { value: 25, band: 'over' }); assert.equal(d.bmi(null, 70), null);
  assert.deepEqual(d.ticks(2300), [0, 500, 1000, 1500, 2000, 2500]); assert.deepEqual(d.ticks(0), [0]); assert.deepEqual(d.ticks(90), [0, 20, 40, 60, 80, 100]); assert.deepEqual(d.ticks(84.6), [0, 20, 40, 60, 80, 100]);
});
