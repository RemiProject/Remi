/**
 * The Nutrition page's numbers, from the server's daily totals (meals logged or cooked in Remi). Pure functions: the
 * screen only lays them out. Days with no meal are "not logged", never zero-calorie days, so averages use logged days.
 */
export type Period = 'today' | 'week' | 'month' | 'all';
export interface DayTotals { date: string; calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number; mealCount: number }
export interface Goal { calorieTarget: number | null; proteinTargetG: number | null }

const DAY = 86_400_000;
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The dates a period covers, oldest first, ending today. "All" is the last 12 months, the server's longest range. */
export function periodDates(today: string, period: Exclude<Period, 'all'>): string[] {
  const length = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  return Array.from({ length }, (_, i) => shiftDate(today, i - length + 1));
}

/** Parses the API's decimal strings; unknown or missing values count as 0 only inside a logged day. */
export function toDayTotals(rows: readonly Record<string, unknown>[]): DayTotals[] {
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  return rows.map(r => ({ date: String(r.date), calories: n(r.calories), proteinG: n(r.proteinG), carbsG: n(r.carbsG), fatG: n(r.fatG),
    fiberG: n(r.fiberG), sugarG: n(r.sugarG), sodiumMg: n(r.sodiumMg), mealCount: n(r.mealCount) }));
}

export interface Summary {
  dates: string[]; days: (DayTotals | null)[]; logged: DayTotals[];
  average: Omit<DayTotals, 'date' | 'mealCount'>; meals: number;
  /** Logged days within 10% of the calorie target; null without a target. */
  onTarget: number | null;
  best: DayTotals | null;
}
const KEYS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg'] as const;

export function summarize(all: readonly DayTotals[], dates: readonly string[], goal: Goal): Summary {
  const byDate = new Map(all.filter(d => d.mealCount > 0).map(d => [d.date, d]));
  const days = dates.map(date => byDate.get(date) ?? null);
  const logged = days.filter((d): d is DayTotals => d !== null);
  const average = Object.fromEntries(KEYS.map(k => [k, logged.length ? logged.reduce((sum, d) => sum + d[k], 0) / logged.length : 0])) as Summary['average'];
  const target = goal.calorieTarget;
  return {
    dates: [...dates], days, logged, average, meals: logged.reduce((sum, d) => sum + d.mealCount, 0),
    onTarget: target ? logged.filter(d => Math.abs(d.calories - target) <= target * 0.1).length : null,
    best: target ? logged.reduce<DayTotals | null>((best, d) => !best || Math.abs(d.calories - target) < Math.abs(best.calories - target) ? d : best, null) : null,
  };
}

/** Consecutive logged days ending today, or ending yesterday when today has nothing yet. */
export function streak(all: readonly DayTotals[], today: string): number {
  const logged = new Set(all.filter(d => d.mealCount > 0).map(d => d.date));
  let day = logged.has(today) ? today : shiftDate(today, -1), count = 0;
  while (logged.has(day)) { count++; day = shiftDate(day, -1); }
  return count;
}

/** Share of energy from protein, carbs and fat (4, 4 and 9 kcal per gram), as whole percents that add to 100. */
export function energyShare(m: { proteinG: number; carbsG: number; fatG: number }) {
  const kcal = { protein: m.proteinG * 4, carbs: m.carbsG * 4, fat: m.fatG * 9 };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  if (!total) return null;
  const protein = Math.round(kcal.protein / total * 100), carbs = Math.round(kcal.carbs / total * 100);
  return { protein, carbs, fat: 100 - protein - carbs };
}

/** Average calories per logged day for each of the last 12 months, oldest first (months with nothing logged are null). */
export function monthly(all: readonly DayTotals[], today: string): { month: string; calories: number | null; days: number }[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (11 - i), 1)); const month = d.toISOString().slice(0, 7);
    const days = all.filter(x => x.mealCount > 0 && x.date.startsWith(month));
    return { month, calories: days.length ? days.reduce((s, x) => s + x.calories, 0) / days.length : null, days: days.length };
  });
}

export interface WeightEntry { measuredAt: string; weightKg: number }
/** The latest weight and how it moved since `from` (the last entry before or at the start of the window, else the first inside it). */
export function weightTrend(entries: readonly WeightEntry[], from: string | null) {
  if (!entries.length) return null;
  const latest = entries[entries.length - 1];
  const inWindow = from ? entries.filter(e => e.measuredAt.slice(0, 10) >= from) : entries;
  const before = from ? entries.filter(e => e.measuredAt.slice(0, 10) < from).at(-1) : undefined;
  const start = before ?? inWindow[0] ?? latest;
  return { latest: latest.weightKg, change: start === latest ? null : Math.round((latest.weightKg - start.weightKg) * 10) / 10, points: before ? [before, ...inWindow] : inWindow };
}

export function bmi(heightCm: number | null, weightKg: number | null) {
  if (!heightCm || !weightKg) return null;
  const value = Math.round(weightKg / (heightCm / 100) ** 2 * 10) / 10;
  return { value, band: value < 18.5 ? 'under' : value < 25 ? 'healthy' : value < 30 ? 'over' : 'obese' } as const;
}

/** Round axis ticks from 0: 4 or 5 even steps, the top one at or above the maximum (and the target). */
export function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const magnitude = 10 ** Math.floor(Math.log10(max / 5));
  const step = [1, 2, 2.5, 5, 10, 20].map(f => f * magnitude).find(s => Math.ceil(max / s) <= 5)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => Math.round(i * step));
}
