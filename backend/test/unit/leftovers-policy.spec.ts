import { describe, expect, it } from 'vitest';
import { assertLeftoverDates } from '../../src/modules/leftovers/leftovers-policy.js';
describe('leftover reminder dates', () => {
  it('permits a valid cooked date with an optional same or later reminder', () => {
    expect(() => assertLeftoverDates('2026-11-03')).not.toThrow();
    expect(() => assertLeftoverDates('2026-11-03', '2026-11-03')).not.toThrow();
    expect(() => assertLeftoverDates('2028-02-29', '2028-03-01')).not.toThrow();
  });
  it('rejects impossible or malformed dates and reminders before cooking', () => {
    for (const cooked of ['2026-02-29', '2026-13-01', 'Nov 3', '', '2026-2-01']) expect(() => assertLeftoverDates(cooked)).toThrow();
    expect(() => assertLeftoverDates('2026-11-03', '2026-11-02')).toThrow();
  });
});
