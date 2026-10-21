import { describe, expect, it } from 'vitest';
import { allocateFefo } from '@/modules/inventory/domain/fefo-allocator.js';

describe('allocateFefo', () => {
  const early = new Date('2026-10-20T00:00:00Z');
  const late = new Date('2026-10-30T00:00:00Z');

  it('consumes the earliest expiry first and then continues to the next batch', () => {
    expect(allocateFefo('1.500', [
      { id: 'later', quantity: '2.000', estimatedExpiryAt: late },
      { id: 'earlier', quantity: '1.000', estimatedExpiryAt: early },
    ])).toEqual([{ id: 'earlier', amount: '1.000' }, { id: 'later', amount: '0.500' }]);
  });

  it('sorts undated batches last and breaks ties by id', () => {
    expect(allocateFefo('1.000', [
      { id: 'z', quantity: '1.000', estimatedExpiryAt: null },
      { id: 'b', quantity: '1.000', estimatedExpiryAt: early },
      { id: 'a', quantity: '1.000', estimatedExpiryAt: early },
    ])).toEqual([{ id: 'a', amount: '1.000' }]);
  });

  it('returns null when stock is insufficient without creating a partial plan', () => {
    expect(allocateFefo('1.001', [{ id: 'only', quantity: '1.000', estimatedExpiryAt: early }])).toBeNull();
  });

  it('does not round quantities through floating point', () => {
    expect(allocateFefo('0.333', [
      { id: 'a', quantity: '0.111', estimatedExpiryAt: early },
      { id: 'b', quantity: '0.222', estimatedExpiryAt: late },
    ])).toEqual([{ id: 'a', amount: '0.111' }, { id: 'b', amount: '0.222' }]);
  });
});
