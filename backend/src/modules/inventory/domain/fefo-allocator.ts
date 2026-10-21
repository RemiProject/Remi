export interface FefoCandidate {
  id: string;
  quantity: string;
  /** Null expiry sorts after dated batches; id is the stable tie breaker. */
  estimatedExpiryAt: Date | null;
}

export interface FefoAllocation {
  id: string;
  amount: string;
}

const milli = (value: string): bigint => {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error(`Expected a non-negative quantity with at most 3 decimals: ${value}`);
  return BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
};

const format = (value: bigint): string => `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;

/** Pure FEFO planning. Inputs must already be expressed in the requested unit. */
export function allocateFefo(requested: string, candidates: readonly FefoCandidate[]): FefoAllocation[] | null {
  const wanted = milli(requested);
  if (wanted <= 0n) throw new Error('Requested quantity must be greater than zero');
  const ordered = [...candidates].sort((a, b) => {
    if (a.estimatedExpiryAt === null && b.estimatedExpiryAt !== null) return 1;
    if (b.estimatedExpiryAt === null && a.estimatedExpiryAt !== null) return -1;
    const dateOrder = (a.estimatedExpiryAt?.getTime() ?? 0) - (b.estimatedExpiryAt?.getTime() ?? 0);
    return dateOrder || a.id.localeCompare(b.id);
  });
  let remaining = wanted;
  const allocations: FefoAllocation[] = [];
  for (const batch of ordered) {
    if (remaining === 0n) break;
    const available = milli(batch.quantity);
    if (available <= 0n) continue;
    const amount = available < remaining ? available : remaining;
    allocations.push({ id: batch.id, amount: format(amount) });
    remaining -= amount;
  }
  return remaining > 0n ? null : allocations;
}
