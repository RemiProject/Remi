import { DomainError } from '@/shared/domain-error.js';
import { MILLILITERS_PER_UNIT, Unit } from './unit.js';

type Decimal = { coefficient: bigint; scale: number };
type Fraction = { numerator: bigint; denominator: bigint };

export type FoodConversionFactors = { densityGPerMl?: string | null; gramsPerPiece?: string | null };

function decimal(value: string): Decimal {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new DomainError('INVALID_QUANTITY', 'Quantity must be a positive decimal string.');
  const [whole, fraction = ''] = value.split('.');
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}

function fraction(value: Decimal): Fraction {
  return { numerator: value.coefficient, denominator: 10n ** BigInt(value.scale) };
}

function multiply(a: Fraction, b: Fraction): Fraction {
  return { numerator: a.numerator * b.numerator, denominator: a.denominator * b.denominator };
}

function divide(a: Fraction, b: Fraction): Fraction {
  if (b.numerator === 0n) throw new DomainError('UNIT_CONVERSION_UNAVAILABLE', 'The food conversion data is incomplete.');
  return { numerator: a.numerator * b.denominator, denominator: a.denominator * b.numerator };
}

function rounded(value: Fraction): string {
  const scaled = value.numerator * 1000n;
  const q = scaled / value.denominator;
  const r = scaled % value.denominator;
  const result = q + (r * 2n >= value.denominator ? 1n : 0n);
  if (result <= 0n) throw new DomainError('INVALID_QUANTITY', 'Quantity rounds to zero at three decimal places.');
  const digits = result.toString().padStart(4, '0');
  return `${digits.slice(0, -3)}.${digits.slice(-3)}`;
}

function toGrams(amount: Fraction, unit: Unit, food: FoodConversionFactors): Fraction {
  if (unit === Unit.GRAM || unit === Unit.KILOGRAM) {
    return unit === Unit.GRAM ? amount : multiply(amount, { numerator: 1000n, denominator: 1n });
  }
  if (unit === Unit.PIECE) {
    if (!food.gramsPerPiece) throw unavailable();
    return multiply(amount, fraction(decimal(food.gramsPerPiece)));
  }
  const mlFactor = MILLILITERS_PER_UNIT[unit];
  if (mlFactor === undefined || !food.densityGPerMl) throw unavailable();
  const ml = multiply(amount, { numerator: BigInt(mlFactor), denominator: 1n });
  return multiply(ml, fraction(decimal(food.densityGPerMl)));
}

function fromGrams(grams: Fraction, unit: Unit, food: FoodConversionFactors): Fraction {
  if (unit === Unit.GRAM || unit === Unit.KILOGRAM) {
    return unit === Unit.GRAM ? grams : divide(grams, { numerator: 1000n, denominator: 1n });
  }
  if (unit === Unit.PIECE) {
    if (!food.gramsPerPiece) throw unavailable();
    return divide(grams, fraction(decimal(food.gramsPerPiece)));
  }
  const mlFactor = MILLILITERS_PER_UNIT[unit];
  if (mlFactor === undefined || !food.densityGPerMl) throw unavailable();
  const ml = divide(grams, fraction(decimal(food.densityGPerMl)));
  return divide(ml, { numerator: BigInt(mlFactor), denominator: 1n });
}

function unavailable(): DomainError {
  return new DomainError('UNIT_NOT_CONVERTIBLE', 'This unit conversion needs density or piece-weight data for the food.');
}

/** Converts through exact rational arithmetic; rounds half-up once to 3 decimal places. */
export function convertQuantity(amount: string, from: Unit, to: Unit, food: FoodConversionFactors): string {
  const input = decimal(amount);
  if (input.coefficient <= 0n) throw new DomainError('INVALID_QUANTITY', 'Quantity must be greater than zero.');
  if (from === to) return rounded(fraction(input));
  const sourceMl = MILLILITERS_PER_UNIT[from];
  const targetMl = MILLILITERS_PER_UNIT[to];
  if (sourceMl !== undefined && targetMl !== undefined) {
    const result = divide(multiply(fraction(input), { numerator: BigInt(sourceMl), denominator: 1n }), { numerator: BigInt(targetMl), denominator: 1n });
    return rounded(result);
  }
  return rounded(fromGrams(toGrams(fraction(input), from, food), to, food));
}

/** Injectable facade kept dependency-free so domain rules stay usable outside Nest. */
export class UnitConverter {
  convert(amount: string, from: Unit, to: Unit, food: FoodConversionFactors): string {
    return convertQuantity(amount, from, to, food);
  }
}
