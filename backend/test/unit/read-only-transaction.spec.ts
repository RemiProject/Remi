import { describe, expect, it, vi } from 'vitest';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { PrismaService } from '@/platform/db/prisma.service.js';
import type { Tx } from '@/platform/db/tx-context.js';

describe('read-only transaction snapshots', () => {
  it('sets database read-only mode before queries and opts into repeatable read', async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: execute } as unknown as Tx;
    const transaction = vi.fn(async (fn: (db: Tx) => unknown) => fn(tx));
    const runner = new TransactionRunner({ $transaction: transaction } as unknown as PrismaService);
    await runner.run(async () => 'result', { userId: 'user', householdId: 'household', readOnly: true });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(execute.mock.calls[0][0].join('')).toBe('SET TRANSACTION READ ONLY');
    expect(execute.mock.calls[1][0].join('')).toContain('set_config');
  });

  it('preserves the existing transaction behavior when the opt-in is absent', async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(async (fn: (db: Tx) => unknown) => fn({ $executeRaw: execute } as unknown as Tx));
    const runner = new TransactionRunner({ $transaction: transaction } as unknown as PrismaService);
    await runner.run(async () => 'result');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), undefined);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
