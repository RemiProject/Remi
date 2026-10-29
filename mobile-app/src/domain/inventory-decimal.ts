import type { Decimal } from './backend-inventory';

export interface DecimalOptions { allowNegative?: boolean }

// Inventory quantities are numeric(12,3) in the backend: 999999999.999 maximum.
const MAX_MILLI = 999_999_999_999n;

/** Parse to exact thousandths. Balances allow zero; signed deltas opt in to negatives. */
export function parseDecimal(value: Decimal, { allowNegative = false }: DecimalOptions = {}): bigint {
  if (typeof value !== 'string' || value.trim() !== value || !/^-?\d+(?:\.\d{1,3})?$/.test(value)) {
    throw new Error('Expected a decimal string with at most three decimal places.');
  }
  const negative = value.startsWith('-');
  if (negative && !allowNegative) throw new Error('Negative quantities are not allowed.');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const magnitude = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (magnitude > MAX_MILLI) throw new Error('Quantity exceeds the backend inventory range.');
  return negative ? -magnitude : magnitude;
}

/** Format exact thousandths, always emitting three decimal places. */
export function formatDecimal(value: bigint, { allowNegative = false }: DecimalOptions = {}): Decimal {
  if (typeof value !== 'bigint') throw new Error('Expected exact thousandths as a bigint.');
  if (value < 0n && !allowNegative) throw new Error('Negative quantities are not allowed.');
  const magnitude = value < 0n ? -value : value;
  if (magnitude > MAX_MILLI) throw new Error('Quantity exceeds the backend inventory range.');
  return `${value < 0n ? '-' : ''}${magnitude / 1000n}.${(magnitude % 1000n).toString().padStart(3, '0')}`;
}

export function compareDecimals(left: Decimal, right: Decimal, options: DecimalOptions = {}): -1 | 0 | 1 {
  const a = parseDecimal(left, options);
  const b = parseDecimal(right, options);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** desired/current are nonnegative balances; the result may be a signed or zero delta. */
export function calculateInventoryDelta(desired: Decimal, current: Decimal): Decimal {
  return formatDecimal(parseDecimal(desired) - parseDecimal(current), { allowNegative: true });
}
