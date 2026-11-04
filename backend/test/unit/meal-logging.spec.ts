import { afterEach, describe, expect, it, vi } from 'vitest';
import { MealLoggingService, type MealLogInput } from '@/modules/meals/application/meal-logging.service.js';
import { UnitConverter } from '@/modules/units/units.public.js';
import { Unit } from '@/shared/food-unit.js';
import type { Tx } from '@/platform/db/tx-context.js';
import type { TransactionRunner } from '@/platform/db/transaction-runner.js';

const input: MealLogInput = { mealType: 'LUNCH', eatenAt: new Date('2026-06-01T21:30:00Z'), origin: 'HOME',
  idempotencyKey: 'meal-test', items: [{ foodId: 'food', amount: '2.000', unit: Unit.GRAM }] };
function harness() {
  const meals: any[] = [], items: any[] = [], queries: string[] = [];
  const food = { id: 'food', name: 'Food', gramsPerPiece: null, densityGPerMl: null,
    calories: '100.00', proteinG: '10.00', carbsG: null, fatG: '2.00', fiberG: null, sugarG: null, sodiumMg: null };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?'); queries.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) throw new Error('Prisma cannot deserialize void through queryRaw');
      if (sql.includes('FROM "Meal"')) return meals;
      if (sql.includes('FROM "HouseholdMember"')) return [{ userId: 'user' }];
      if (sql.includes('FROM "Food"')) return [food];
      if (sql.includes('FROM "Household"')) return [{ timezone: 'Africa/Cairo' }];
      if (sql.includes('FROM "MealItem"')) return items;
      throw new Error(`Unexpected query ${sql}`);
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...v: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('INSERT INTO "Meal"')) meals.push({ id: v[0], userId: v[2], mealType: v[3], eatenAt: v[4], origin: v[5], name: v[6], requestHash: v[8] });
      if (sql.includes('INSERT INTO "MealItem"')) items.push({ mealId: v[1], foodId: v[3], quantity: v[4], unit: v[5], quantityG: v[6],
        calories: v[7], proteinG: v[8], carbsG: v[9], fatG: v[10], fiberG: v[11], sugarG: v[12], sodiumMg: v[13] });
      return 1;
    }),
  } as unknown as Tx;
  const inventory = { consumeWithinTransaction: vi.fn().mockResolvedValue({}) };
  const outbox = { publish: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: (fn: (tx: Tx) => unknown) => fn(tx) } as TransactionRunner;
  const service = new MealLoggingService(transactions, inventory as any, new UnitConverter(), outbox as any);
  return { service, inventory, food, meals, items, queries, outbox };
}

afterEach(() => { vi.useRealTimers(); });

describe('meal logging stock policy and compatibility', () => {
  it('defaults to existing consumption and nutrition, with no extra household lookup', async () => {
    const h = harness(); const result = await h.service.logMeal('home', 'user', input);
    expect(result.replayed).toBe(false); expect(h.inventory.consumeWithinTransaction.mock.calls[0][4]).toBeUndefined();
    expect(h.queries.some(sql => sql.includes('FROM "Household"'))).toBe(false);
    expect(result.meals[0].items[0]).toMatchObject({ quantityG: '2.00', calories: '2.00', proteinG: '0.20', carbsG: null });
    expect(h.outbox.publish).toHaveBeenCalledTimes(1);
  });

  it('loads timezone once and passes a single server-clock cutoff only for HOME opt-in', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-01T21:30:00Z'));
    const h = harness(); await h.service.logMeal('home', 'user', { ...input, skipExpiredBatches: true });
    expect(h.inventory.consumeWithinTransaction.mock.calls[0][4]).toEqual({ householdTimezone: 'Africa/Cairo', now: new Date() });
    expect(h.queries.filter(sql => sql.includes('FROM "Household"'))).toHaveLength(1);
    const away = harness(); await away.service.logMeal('home', 'user', { ...input, origin: 'AWAY', skipExpiredBatches: true });
    expect(away.inventory.consumeWithinTransaction).not.toHaveBeenCalled();
    expect(away.queries.some(sql => sql.includes('FROM "Household"'))).toBe(false);
  });

  it('omitted and explicit false share the old idempotency hash, while true cannot reuse that key', async () => {
    const h = harness(); await h.service.logMeal('home', 'user', input);
    expect((await h.service.logMeal('home', 'user', { ...input, skipExpiredBatches: false })).replayed).toBe(true);
    expect(h.inventory.consumeWithinTransaction).toHaveBeenCalledTimes(1);
    await expect(h.service.logMeal('home', 'user', { ...input, skipExpiredBatches: true })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
