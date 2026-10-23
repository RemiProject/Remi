import { isCalendarDate, localDateKey } from '../domain/inventory';
export function calendarLocale(language: 'en' | 'ar') { return language === 'ar' ? 'ar-EG' : 'en-US'; }
export function calendarFirstWeekday(language: 'en' | 'ar') { return language === 'ar' ? 6 : 0; }
export function monthStart(date: string) { if (!isCalendarDate(date)) throw new Error('Invalid date'); return date.slice(0, 7) + '-01'; }
export function shiftMonth(date: string, offset: number) {
 const value = new Date(monthStart(date) + 'T12:00:00'); value.setMonth(value.getMonth() + offset);
 const result = localDateKey(value); return isCalendarDate(result) ? result : monthStart(date);
}
export function monthGrid(date: string, language: 'en' | 'ar') {
 const first = new Date(monthStart(date) + 'T12:00:00');
 const next = new Date(first); next.setMonth(next.getMonth() + 1); next.setDate(0);
 const leading = (first.getDay() - calendarFirstWeekday(language) + 7) % 7;
 const count = Math.ceil((leading + next.getDate()) / 7) * 7;
 return Array.from({ length: count / 7 }, (_, row) => Array.from({ length: 7 }, (_, column) => {
  const value = new Date(first); value.setDate(1 - leading + row * 7 + column); const key = localDateKey(value);
  return { date: isCalendarDate(key) ? key : null, inMonth: value.getMonth() === first.getMonth() && value.getFullYear() === first.getFullYear() };
 }));
}
export function calendarWeekdays(language: 'en' | 'ar') {
 const formatter = new Intl.DateTimeFormat(calendarLocale(language), { weekday: 'narrow', calendar: 'gregory' });
 return Array.from({ length: 7 }, (_, index) => { const value = new Date('2026-10-11T12:00:00'); value.setDate(value.getDate() + (calendarFirstWeekday(language) + index) % 7); return { label: formatter.format(value), full: new Intl.DateTimeFormat(calendarLocale(language), { weekday: 'long' }).format(value) }; });
}
