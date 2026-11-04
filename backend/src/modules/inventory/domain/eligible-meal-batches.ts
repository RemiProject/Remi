export interface MealExpiryPolicy { householdTimezone: string; now: Date }

/** Opt-in meal consumption only. Earlier timestamps today stay eligible all day. */
export function eligibleMealBatches<T extends { estimatedExpiryAt: Date | null }>(batches: T[], policy?: MealExpiryPolicy): T[] {
  if (!policy) return batches;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: policy.householdTimezone, calendar: 'iso8601', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const day = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  };
  const today = day(policy.now);
  return batches.filter(batch => batch.estimatedExpiryAt === null || day(batch.estimatedExpiryAt) >= today);
}
