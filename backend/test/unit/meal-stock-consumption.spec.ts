import { describe, expect, it, vi } from 'vitest';
import { InventoryLedgerService, InsufficientStockError } from '@/modules/inventory/application/inventory-ledger.service.js';
import { eligibleMealBatches } from '@/modules/inventory/domain/eligible-meal-batches.js';
import { UnitConverter } from '@/modules/units/units.public.js';
import { Unit } from '@/shared/food-unit.js';
import type { Tx } from '@/platform/db/tx-context.js';
import type { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { InventoryResolver } from '@/modules/inventory/presentation/inventory.resolver.js';
import { MealResolver } from '@/modules/meals/presentation/meal.resolver.js';

const policy = { householdTimezone: 'Africa/Cairo', now: new Date('2026-06-01T21:30:00Z') };
const batch = (id: string, expiry: string | null, quantity = '2.000', unit = Unit.GRAM) => ({ id, quantity, unit, version: 1, estimatedExpiryAt: expiry ? new Date(expiry) : null });
const input = { foodId: 'food', amount: '1.000', unit: Unit.GRAM, idempotencyKey: 'consume-test' };
function harness(batches: ReturnType<typeof batch>[]) {
  const updates: Array<{ id: string; amount: string }> = [];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('FROM "Food"')) return [{ id: 'food', gramsPerPiece: null, densityGPerMl: null }];
      if (sql.includes('INSERT INTO "FoodEvent"')) return [{ id: values[0] }];
      if (sql.includes('FROM "InventoryItem"')) return batches;
      if (sql.includes('UPDATE "InventoryItem"')) {
        updates.push({ amount: values[0] as string, id: values[1] as string });
        return [{ quantity: '0.000', version: 2 }];
      }
      throw new Error(`Unexpected query ${sql}`);
    }),
  } as unknown as Tx;
  const transactions = { run: (fn: (tx: Tx) => unknown) => fn(tx) } as TransactionRunner;
  return { tx, updates, ledger: new InventoryLedgerService(transactions, new UnitConverter()) };
}

describe('opt-in meal batch expiry', () => {
  it('keeps legacy consumption/discard FEFO including expired stock when not opted in', async () => {
    for (const operation of ['consumeStock', 'discardStock'] as const) {
      const h = harness([batch('valid', null), batch('expired', '2026-06-01T20:59:59Z')]);
      await h.ledger[operation]('home', 'user', input);
      expect(h.updates).toEqual([{ id: 'expired', amount: '1.000' }]);
    }
    const h = harness([batch('expired', '2026-06-01T20:59:59Z')]);
    await h.ledger.consumeWithinTransaction(h.tx, 'home', 'user', input);
    expect(h.updates[0].id).toBe('expired');
  });

  it('uses FEFO among today/future/undated eligible batches and ignores expired batches before conversion', async () => {
    const h = harness([batch('undated', null), batch('future', '2026-06-04T10:00:00Z'),
      batch('expired-unconvertible', '2026-06-01T20:59:59Z', '100.000', Unit.PIECE),
      batch('today', '2026-06-01T21:00:00Z')]);
    await h.ledger.consumeWithinTransaction(h.tx, 'home', 'user', { ...input, amount: '5.000' }, policy);
    expect(h.updates).toEqual([{ id: 'today', amount: '2.000' }, { id: 'future', amount: '2.000' }, { id: 'undated', amount: '1.000' }]);
  });

  it('returns the failed food, requested amount and only valid available stock; makes no batch update', async () => {
    const h = harness([batch('expired', '2026-06-01T20:59:59Z', '100.000'), batch('valid', null)]);
    await expect(h.ledger.consumeWithinTransaction(h.tx, 'home', 'user', { ...input, amount: '3.000' }, policy))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { foodId: 'food', requested: '3.000', available: '2.000', unit: Unit.GRAM } });
    expect(h.updates).toEqual([]);
  });

  it('still fails stock conversion when an eligible batch cannot be converted', async () => {
    const h = harness([batch('valid', null, '1.000', Unit.PIECE)]);
    await expect(h.ledger.consumeWithinTransaction(h.tx, 'home', 'user', input, policy)).rejects.toMatchObject({ code: 'UNIT_NOT_CONVERTIBLE' });
    expect(h.updates).toEqual([]);
  });

  it('compares household calendar days across UTC midnight and DST, retaining undated batches', () => {
    const batches = [batch('boundary', '2026-06-01T20:59:59Z'), batch('undated', null)];
    expect(eligibleMealBatches(batches, policy).map(b => b.id)).toEqual(['undated']);
    expect(eligibleMealBatches(batches, { ...policy, householdTimezone: 'America/Los_Angeles' }).map(b => b.id)).toEqual(['boundary', 'undated']);
    expect(eligibleMealBatches(batches)).toBe(batches);
    const dst = [batch('yesterday', '2026-04-23T21:59:59Z'), batch('today', '2026-04-23T22:00:00Z')];
    expect(eligibleMealBatches(dst, { householdTimezone: 'Africa/Cairo', now: new Date('2026-04-24T10:00:00Z') }).map(b => b.id)).toEqual(['today']);
  });
});

describe('insufficient stock resolver metadata', () => {
  it('propagates foodId/requested/available/unit for consume, discard, logMeal and logFamilyMeal', async () => {
    const fail = vi.fn().mockRejectedValue(new InsufficientStockError('2.000', Unit.GRAM, 'food', '3.000'));
    const inventory = new InventoryResolver({ consumeStock: fail, discardStock: fail } as any);
    const meals = new MealResolver({ logMeal: fail, logFamilyMeal: fail } as any, {} as any);
    const ctx = { householdId: 'home', userId: 'user' } as any;
    for (const result of [await inventory.consumeStock(ctx, input), await inventory.discardStock(ctx, input),
      await meals.logMeal(ctx, {} as any), await meals.logFamilyMeal(ctx, {} as any)]) {
      expect(result).toMatchObject({ foodId: 'food', requested: '3.000', available: '2.000', unit: Unit.GRAM });
    }
  });
});
