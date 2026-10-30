import { isCalendarDate } from './inventory';

/** Last whole second of a calendar day in an IANA zone, including DST days. */
export function inventoryEndOfDay(day: string, timezone: string): string {
  if (!isCalendarDate(day)) throw new Error('Invalid calendar day.');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const localDay = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const part = (name: string) => parts.find(p => p.type === name)!.value;
    return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
  };
  const midnight = Date.parse(`${day}T00:00:00Z`);
  let low = midnight - 48 * 3600000, high = midnight + 48 * 3600000;
  // Find the first second after the requested local day; never assume 24 hours.
  low = Math.floor(low / 1000); high = Math.floor(high / 1000);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (localDay(mid * 1000) <= day) low = mid + 1;
    else high = mid;
  }
  const last = (low - 1) * 1000;
  if (localDay(last) !== day) throw new Error('This calendar day does not exist in the household timezone.');
  return new Date(last).toISOString();
}
