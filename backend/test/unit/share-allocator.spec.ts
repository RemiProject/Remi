import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocateShares } from '@/modules/meals/domain/share-allocator.js';

const milli = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
};

describe('allocateShares', () => {
  it('distributes residue by largest remainder and keeps exact total', () => {
    expect(allocateShares('1.000', ['1.000', '1.000', '1.000'])).toEqual(['0.334', '0.333', '0.333']);
  });

  it('always returns positive-weight shares that sum exactly to the input', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 999_999 }),
      fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 8 }),
      (total, weights) => {
        const asDecimal = (n: number) => `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`;
        const allocations = allocateShares(asDecimal(total), weights.map(asDecimal));
        expect(allocations.reduce((sum, amount) => sum + milli(amount), 0n)).toBe(BigInt(total));
      },
    ));
  });
});
