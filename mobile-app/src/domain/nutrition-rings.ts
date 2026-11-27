/**
 * Remi's three daily rings, the streak and the awards. Built to reward balance and consistency, never eating less:
 * - Fuel closes when the day lands within 10% of the calorie goal (under or over), so skipping food cannot close it.
 *   Without a goal it counts meals (three a day).
 * - Protein closes at the protein goal (60 g when none is set).
 * - Fibre closes at 25 g, the common adult guideline.
 * The streak allows one rest day in any 7, so a missed day does not wipe out weeks of habit.
 */
import { shiftDate, type DayTotals, type Goal } from './nutrition-dashboard';

export type RingKey = 'fuel' | 'protein' | 'fibre';
export interface Ring { key: RingKey; value: number; target: number; progress: number; closed: boolean; over: boolean }
export const FIBRE_TARGET_G = 25, DEFAULT_PROTEIN_G = 60, MEALS_PER_DAY = 3;

export function ringsFor(day: DayTotals | null, goal: Goal): Ring[] {
  const calories = day?.calories ?? 0, target = goal.calorieTarget;
  const fuel: Ring = target
    ? { key: 'fuel', value: calories, target, progress: calories / target, closed: Math.abs(calories - target) <= target * 0.1, over: calories > target * 1.1 }
    : { key: 'fuel', value: day?.mealCount ?? 0, target: MEALS_PER_DAY, progress: (day?.mealCount ?? 0) / MEALS_PER_DAY, closed: (day?.mealCount ?? 0) >= MEALS_PER_DAY, over: false };
  const proteinTarget = goal.proteinTargetG ?? DEFAULT_PROTEIN_G, protein = day?.proteinG ?? 0, fibre = day?.fiberG ?? 0;
  return [fuel,
    { key: 'protein', value: protein, target: proteinTarget, progress: protein / proteinTarget, closed: protein >= proteinTarget, over: false },
    { key: 'fibre', value: fibre, target: FIBRE_TARGET_G, progress: fibre / FIBRE_TARGET_G, closed: fibre >= FIBRE_TARGET_G, over: false }];
}

const loggedSet = (days: readonly DayTotals[]) => new Set(days.filter(d => d.mealCount > 0).map(d => d.date));

/**
 * Logged days in a row ending today (or yesterday while today is still empty), where one missed day in any 7 is a
 * rest day rather than a break. `restUsed` says whether this week's rest day has been spent.
 */
export function forgivingStreak(days: readonly DayTotals[], today: string): { days: number; restUsed: boolean } {
  const logged = loggedSet(days);
  let day = logged.has(today) ? today : shiftDate(today, -1), count = 0, lastRest: string | null = null, gap: string | null = null;
  for (let guard = 0; guard < 800; guard++) {
    // A gap only becomes a rest day once an older logged day continues the streak behind it.
    if (logged.has(day)) { count++; if (gap) { lastRest = gap; gap = null; } }
    else if (count > 0 && !gap && (lastRest === null || Date.parse(lastRest) - Date.parse(day) >= 7 * 86_400_000)) gap = day;
    else break;
    day = shiftDate(day, -1);
  }
  return { days: count, restUsed: lastRest !== null && Date.parse(today) - Date.parse(lastRest) < 7 * 86_400_000 };
}

/** The longest forgiving streak anywhere in the history (for awards). */
export function bestStreak(days: readonly DayTotals[]): number {
  const dates = [...loggedSet(days)].sort();
  return dates.reduce((best, date) => Math.max(best, forgivingStreak(days, date).days), 0);
}

export interface Award { id: string; icon: 'flame' | 'award' | 'rings' | 'recipe' | 'health'; en: [string, string]; ar: [string, string]; have: number; need: number; earned: boolean }

/** Every award with its progress, earned ones first. */
export function awards(days: readonly DayTotals[], goal: Goal): Award[] {
  const logged = days.filter(d => d.mealCount > 0);
  const rings = logged.map(d => ringsFor(d, goal));
  const count = (pick: (r: Ring[]) => boolean) => rings.filter(pick).length;
  const perfect = new Set(logged.filter((_, i) => rings[i].every(r => r.closed)).map(d => d.date));
  // Best number of perfect days inside any 7-day window.
  const bestWeek = [...perfect].reduce((best, date) => Math.max(best, Array.from({ length: 7 }, (_, i) => shiftDate(date, i)).filter(d => perfect.has(d)).length), 0);
  const streak = bestStreak(days), meals = logged.reduce((s, d) => s + d.mealCount, 0);
  const list: Omit<Award, 'earned'>[] = [
    { id: 'first', icon: 'recipe', en: ['First bite', 'Log your first meal'], ar: ['أول لقمة', 'سجّل أول وجبة'], have: Math.min(1, logged.length), need: 1 },
    { id: 'streak-3', icon: 'flame', en: ['Warming up', 'A 3-day streak'], ar: ['بداية دافئة', '٣ أيام متتالية'], have: Math.min(3, streak), need: 3 },
    { id: 'streak-7', icon: 'flame', en: ['On a roll', 'A 7-day streak'], ar: ['على الطريق', '٧ أيام متتالية'], have: Math.min(7, streak), need: 7 },
    { id: 'streak-30', icon: 'flame', en: ['Habit made', 'A 30-day streak'], ar: ['عادة راسخة', '٣٠ يومًا متتاليًا'], have: Math.min(30, streak), need: 30 },
    { id: 'perfect-day', icon: 'rings', en: ['Full circle', 'Close all three rings in a day'], ar: ['الدائرة الكاملة', 'أغلق الحلقات الثلاث في يوم'], have: Math.min(1, perfect.size), need: 1 },
    { id: 'balanced-week', icon: 'rings', en: ['Balanced week', '5 full-circle days in a week'], ar: ['أسبوع متوازن', '٥ أيام كاملة في أسبوع'], have: Math.min(5, bestWeek), need: 5 },
    { id: 'protein-10', icon: 'health', en: ['Protein pro', 'Close Protein on 10 days'], ar: ['محترف البروتين', 'أغلق البروتين في ١٠ أيام'], have: Math.min(10, count(r => r[1].closed)), need: 10 },
    { id: 'fibre-10', icon: 'health', en: ['Plant power', 'Close Fibre on 10 days'], ar: ['قوة النبات', 'أغلق الألياف في ١٠ أيام'], have: Math.min(10, count(r => r[2].closed)), need: 10 },
    { id: 'meals-100', icon: 'award', en: ['Century', 'Log 100 meals'], ar: ['المئوية', 'سجّل ١٠٠ وجبة'], have: Math.min(100, meals), need: 100 },
  ];
  return list.map(a => ({ ...a, earned: a.have >= a.need })).sort((a, b) => Number(b.earned) - Number(a.earned));
}
