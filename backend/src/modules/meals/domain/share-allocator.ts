import { DomainError } from '@/shared/domain-error.js';

/** Largest-remainder allocation in thousandths; returned shares always sum to total exactly. */
export function allocateShares(total: string, weights: string[]): string[] {
  const totalMilli = toMilli(total);
  const weightMilli = weights.map(toMilli);
  if (totalMilli <= 0n || weightMilli.length === 0 || weightMilli.some((weight) => weight <= 0n)) {
    throw new DomainError('INVALID_SHARES', 'Total amount and every share weight must be positive.');
  }
  const weightTotal = weightMilli.reduce((sum, weight) => sum + weight, 0n);
  const floors = weightMilli.map((weight) => totalMilli * weight / weightTotal);
  const residues = weightMilli.map((weight, index) => ({ index, remainder: (totalMilli * weight) % weightTotal }));
  residues.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  let remaining = totalMilli - floors.reduce((sum, value) => sum + value, 0n);
  for (const residue of residues) {
    if (remaining <= 0n) break;
    floors[residue.index] += 1n;
    remaining -= 1n;
  }
  return floors.map(fromMilli);
}

function toMilli(value: string): bigint {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) throw new DomainError('INVALID_QUANTITY', 'Share quantities must be decimal strings with at most three decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function fromMilli(value: bigint): string { return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`; }
