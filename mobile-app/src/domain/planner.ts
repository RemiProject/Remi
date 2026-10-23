import { isCalendarDate, localDateKey } from './inventory';
export const mealPeriods = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealPeriod = (typeof mealPeriods)[number];
export interface PlannedMeal { id: string; date: string; period: MealPeriod; recipeId: string }
export function validMeal(value: unknown): value is PlannedMeal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const meal = value as Record<string, unknown>;
  return Object.keys(meal).length === 4 && ['id', 'date', 'period', 'recipeId'].every((key) => Object.hasOwn(meal, key))
    && typeof meal.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(meal.id) && isCalendarDate(meal.date)
    && mealPeriods.includes(meal.period as MealPeriod) && typeof meal.recipeId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(meal.recipeId);
}
export function shiftDate(date: string, days: number) {
  if (!isCalendarDate(date)) throw new Error('Invalid calendar date');
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  const next = localDateKey(value);
  if (!isCalendarDate(next)) throw new Error('Date out of range');
  return next;
}
export function weekDates(date: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const start = shiftDate(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}
