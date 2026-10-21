/** Exponential backoff with full jitter, capped at 15 minutes. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts * 1000, 15 * 60 * 1000);
  return Math.round(base / 2 + random() * (base / 2));
}
