import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { convertQuantity } from '@/modules/units/domain/unit-converter.js';
import { Unit } from '@/modules/units/domain/unit.js';

const milliString = (value: number) => `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}`;
const milliValue = (value: string) => {
  const [whole, fraction = '000'] = value.split('.');
  return BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
};

describe('convertQuantity', () => {
  it('converts between compatible measures using exact decimal arithmetic', () => {
    expect(convertQuantity('1', Unit.CUP, Unit.LITER, {})).toBe('0.240');
    expect(convertQuantity('2', Unit.TABLESPOON, Unit.GRAM, { densityGPerMl: '0.916' })).toBe('27.480');
    expect(convertQuantity('3', Unit.PIECE, Unit.GRAM, { gramsPerPiece: '50' })).toBe('150.000');
    expect(convertQuantity('1', Unit.KILOGRAM, Unit.GRAM, {})).toBe('1000.000');
    expect(convertQuantity('0.333', Unit.CUP, Unit.MILLILITER, {})).toBe('79.920');
  });

  it('rejects unknown cross-dimension factors and quantities rounded to zero', () => {
    expect(() => convertQuantity('1', Unit.CUP, Unit.GRAM, {})).toThrowError(expect.objectContaining({ code: 'UNIT_NOT_CONVERTIBLE', status: 422 }));
    expect(() => convertQuantity('0.0004', Unit.GRAM, Unit.KILOGRAM, {})).toThrowError(/rounds to zero/);
    expect(() => convertQuantity('0', Unit.GRAM, Unit.GRAM, {})).toThrowError(/greater than zero/);
  });

  it('round-trips kilogram quantities through grams without losing thousandths', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (milli) => {
      const kilograms = milliString(milli);
      const grams = convertQuantity(kilograms, Unit.KILOGRAM, Unit.GRAM, {});
      expect(convertQuantity(grams, Unit.GRAM, Unit.KILOGRAM, {})).toBe(kilograms);
    }), { numRuns: 1000 });
  });

  it('round-trips measured volume through food density within one milli-unit', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000 }), (milli) => {
      const amount = milliString(milli);
      const grams = convertQuantity(amount, Unit.MILLILITER, Unit.GRAM, { densityGPerMl: '1.030' });
      const roundTrip = convertQuantity(grams, Unit.GRAM, Unit.MILLILITER, { densityGPerMl: '1.030' });
      expect(milliValue(roundTrip) - BigInt(milli)).toBeLessThanOrEqual(1n);
      expect(BigInt(milli) - milliValue(roundTrip)).toBeLessThanOrEqual(1n);
    }), { numRuns: 1000 });
  });

  it('preserves a 0.333 × 3 kg quantity exactly', () => {
    expect(convertQuantity('0.333', Unit.KILOGRAM, Unit.GRAM, {})).toBe('333.000');
    expect(convertQuantity('0.999', Unit.KILOGRAM, Unit.GRAM, {})).toBe('999.000');
  });
});
