import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { UnitConverter } from '@/modules/units/units.public.js';
import { InventoryLedgerService, type StockInput } from '@/modules/inventory/application/inventory-ledger.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { allocateShares } from '@/modules/meals/domain/share-allocator.js';

export type MealOrigin = 'HOME' | 'AWAY' | 'UNKNOWN';
export type MealTypeValue = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'OTHER';
export interface MealFoodInput { foodId: string; amount: string; unit: Unit }
export interface MealShareInput { userId: string; servings: string }
export interface MealLogInput {
  mealType: MealTypeValue; eatenAt: Date; origin?: MealOrigin; name?: string;
  idempotencyKey: string; items: MealFoodInput[];
}
export interface FamilyMealLogInput extends MealLogInput { totalServings: string; shares: MealShareInput[]; guestServings?: string }

type FoodFacts = {
  id: string; name: string; densityGPerMl: string | null; gramsPerPiece: string | null;
  calories: string | null; proteinG: string | null; carbsG: string | null; fatG: string | null;
  fiberG: string | null; sugarG: string | null; sodiumMg: string | null;
};
type MealRow = { id: string; userId: string; mealType: MealTypeValue; eatenAt: Date; origin: MealOrigin; name: string | null; replayed?: boolean };

@Injectable()
export class MealLoggingService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly inventory: InventoryLedgerService,
    private readonly converter: UnitConverter,
    private readonly outbox: OutboxPublisher,
  ) {}

  logMeal(householdId: string, actorUserId: string, input: MealLogInput) {
    return this.transactions.run((tx) => this.logWithinTransaction(tx, householdId, actorUserId, [actorUserId], input, null), { householdId, userId: actorUserId });
  }

  logFamilyMeal(householdId: string, actorUserId: string, input: FamilyMealLogInput) {
    return this.transactions.run((tx) => this.logWithinTransaction(tx, householdId, actorUserId, input.shares.map((share) => share.userId), input, input), { householdId, userId: actorUserId });
  }

  private async logWithinTransaction(tx: Tx, householdId: string, actorUserId: string, requestedUsers: string[], input: MealLogInput, family: FamilyMealLogInput | null) {
    validateMealInput(input);
    if (family) validateFamilyShares(family);
    const origin = input.origin ?? 'HOME';
    const users = [...requestedUsers];
    const sortedUsers = [...users].sort();
    if (new Set(users).size !== users.length || users.length === 0) throw new DomainError('INVALID_SHARES', 'Each active household member can appear only once in the meal shares.');
    const requestHash = hashMealRequest(input, family);

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${householdId}:${input.idempotencyKey}`}, 0))`;
    const prior = await tx.$queryRaw<Array<MealRow & { requestHash: string }>>`SELECT "id", "userId", "mealType"::text AS "mealType", "eatenAt", "origin"::text AS "origin", "name", "requestHash" FROM "Meal" WHERE "householdId" = ${householdId}::uuid AND "idempotencyKey" = ${input.idempotencyKey} ORDER BY "userId"`;
    if (prior.length) {
      if (prior.some((meal) => meal.requestHash.trim() !== requestHash) || !sameStrings(prior.map((meal) => meal.userId).sort(), sortedUsers)) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This idempotencyKey was already used with a different meal request.', 422);
      }
      const results = await loadMeals(tx, householdId, prior.map((meal) => meal.id));
      return { replayed: true, meals: results };
    }

    const active = await tx.$queryRaw<Array<{ userId: string }>>`SELECT "userId" FROM "HouseholdMember" WHERE "householdId" = ${householdId}::uuid AND "userId" = ANY(${users}::uuid[]) AND "leftAt" IS NULL ORDER BY "userId"`;
    if (!sameStrings(active.map((row) => row.userId), sortedUsers)) throw new DomainError('INACTIVE_HOUSEHOLD_MEMBER', 'A meal can only be logged for active household members.', 422);

    const items = [...input.items].sort((a, b) => a.foodId.localeCompare(b.foodId));
    const foodIds = items.map((item) => item.foodId);
    if (new Set(foodIds).size !== foodIds.length) throw new DomainError('DUPLICATE_MEAL_FOOD', 'A food may appear only once in a meal.');
    const factsRows = await tx.$queryRaw<FoodFacts[]>`
      SELECT f."id", f."name", f."densityGPerMl"::text AS "densityGPerMl", f."gramsPerPiece"::text AS "gramsPerPiece",
        n."caloriesPer100g"::text AS "calories", n."proteinG"::text AS "proteinG", n."carbsG"::text AS "carbsG", n."fatG"::text AS "fatG",
        n."fiberG"::text AS "fiberG", n."sugarG"::text AS "sugarG", n."sodiumMg"::text AS "sodiumMg"
      FROM "Food" f LEFT JOIN "NutritionProfile" n ON n."foodId" = f."id"
      WHERE f."id" = ANY(${foodIds}::uuid[]) AND f."archivedAt" IS NULL ORDER BY f."id"`;
    if (factsRows.length !== foodIds.length) throw new DomainError('FOOD_NOT_FOUND', 'One or more meal foods do not exist.', 404);
    const foodFacts = new Map(factsRows.map((food) => [food.id, food]));

    if (origin === 'HOME') {
      for (const item of items) {
        const ledgerInput: StockInput = { foodId: item.foodId, amount: item.amount, unit: item.unit, idempotencyKey: ledgerKey(householdId, input.idempotencyKey, item.foodId) };
        await this.inventory.consumeWithinTransaction(tx, householdId, actorUserId, ledgerInput);
      }
    }

    const memberShares = family ? family.shares.map((share) => share.servings) : ['1.000'];
    const guest = family?.guestServings ?? '0.000';
    const weights = decimalMilli(guest) === 0n ? memberShares : [...memberShares, guest];
    const mealRows: MealRow[] = [];
    for (const userId of users) {
      const mealId = newId();
      await tx.$executeRaw`INSERT INTO "Meal" ("id", "householdId", "userId", "mealType", "eatenAt", "origin", "name", "idempotencyKey", "requestHash") VALUES (${mealId}::uuid, ${householdId}::uuid, ${userId}::uuid, ${input.mealType}::"MealType", ${input.eatenAt}::timestamptz, ${origin}::"ItemOrigin", ${input.name?.trim() ?? null}, ${input.idempotencyKey}, ${requestHash})`;
      mealRows.push({ id: mealId, userId, mealType: input.mealType, eatenAt: input.eatenAt, origin, name: input.name?.trim() ?? null });
    }

    for (const item of items) {
      const allocated = family ? allocateShares(item.amount, weights) : [item.amount];
      for (let index = 0; index < users.length; index++) {
        const amount = allocated[index];
        if (amount === '0.000') continue; // A very small guest/member share can round down to zero.
        await this.insertMealItem(tx, householdId, mealRows[index].id, item, amount, foodFacts.get(item.foodId)!);
      }
    }

    const mealIds = mealRows.map((meal) => meal.id);
    await this.outbox.publish(tx, {
      topic: 'meal.logged',
      dedupeKey: `meal:${hashText(`${householdId}:${input.idempotencyKey}`)}`,
      householdId,
      payload: { mealIds },
    });
    const results = await loadMeals(tx, householdId, mealIds);
    return { replayed: false, meals: results };
  }

  private async insertMealItem(tx: Tx, householdId: string, mealId: string, item: MealFoodInput, amount: string, food: FoodFacts): Promise<void> {
    const quantityGRaw = this.converter.convert(amount, item.unit, Unit.GRAM, food);
    const quantityG = roundDecimal(quantityGRaw, 2);
    if (Number(quantityG) <= 0) throw new DomainError('INVALID_QUANTITY', 'The meal portion is too small to record in grams.');
    const nutrition = (value: string | null) => value === null ? null : nutritionForGrams(value, quantityG);
    await tx.$executeRaw`
      INSERT INTO "MealItem" ("id", "mealId", "householdId", "foodId", "quantity", "unit", "quantityG", "calories", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg", "nutritionSnapshotAt")
      VALUES (${newId()}::uuid, ${mealId}::uuid, ${householdId}::uuid, ${item.foodId}::uuid, ${amount}::numeric, ${item.unit}::"Unit", ${quantityG}::numeric,
        ${nutrition(food.calories)}::numeric, ${nutrition(food.proteinG)}::numeric, ${nutrition(food.carbsG)}::numeric, ${nutrition(food.fatG)}::numeric,
        ${nutrition(food.fiberG)}::numeric, ${nutrition(food.sugarG)}::numeric, ${nutrition(food.sodiumMg)}::numeric, now())`;
  }
}

function validateMealInput(input: MealLogInput): void {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must contain 1 to 200 characters.');
  if (!(input.eatenAt instanceof Date) || Number.isNaN(input.eatenAt.getTime())) throw new DomainError('INVALID_DATETIME', 'eatenAt must be a valid timestamp.');
  if (!input.items.length || input.items.length > 100) throw new DomainError('INVALID_MEAL_ITEMS', 'A meal must include between 1 and 100 foods.');
  for (const item of input.items) if (!/^\d+(?:\.\d{1,3})?$/.test(item.amount) || decimalMilli(item.amount) <= 0n) throw new DomainError('INVALID_QUANTITY', 'Meal quantities must be positive decimals with at most three decimal places.');
}

function validateFamilyShares(input: FamilyMealLogInput): void {
  if (!input.shares.length || input.shares.length > 20) throw new DomainError('INVALID_SHARES', 'A family meal requires between 1 and 20 active members.');
  if (input.shares.some(({ servings }) => !/^\d+(?:\.\d{1,3})?$/.test(servings) || decimalMilli(servings) <= 0n)) throw new DomainError('INVALID_SHARES', 'Each member share must be positive.');
  const guests = input.guestServings ?? '0.000';
  if (!/^\d+(?:\.\d{1,3})?$/.test(guests)) throw new DomainError('INVALID_SHARES', 'guestServings must be a nonnegative decimal.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(input.totalServings) || decimalMilli(input.totalServings) <= 0n) throw new DomainError('INVALID_SHARES', 'totalServings must be positive.');
  const actual = input.shares.reduce((sum, share) => sum + decimalMilli(share.servings), decimalMilli(guests));
  if (actual !== decimalMilli(input.totalServings)) throw new DomainError('SHARES_MISMATCH', 'Member and guest servings must add up to totalServings.', 422, { expectedServings: input.totalServings, actualServings: formatMilli(actual) });
  const memberIds = input.shares.map((share) => share.userId);
  if (new Set(memberIds).size !== memberIds.length) throw new DomainError('INVALID_SHARES', 'A household member can appear only once in the meal shares.');
}

function hashMealRequest(input: MealLogInput, family: FamilyMealLogInput | null): string {
  const payload = {
    mealType: input.mealType, eatenAt: input.eatenAt.toISOString(), origin: input.origin ?? 'HOME', name: input.name?.trim() ?? null,
    items: [...input.items].sort((a, b) => a.foodId.localeCompare(b.foodId)).map((item) => ({ ...item })),
    shares: family ? [...family.shares].sort((a, b) => a.userId.localeCompare(b.userId)) : null,
    guestServings: family?.guestServings ?? '0.000',
    totalServings: family?.totalServings ?? null,
  };
  return hashText(JSON.stringify(payload));
}

function ledgerKey(householdId: string, idempotencyKey: string, foodId: string): string {
  return hashText(`${householdId}:${idempotencyKey}:${foodId}`);
}
function hashText(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function sameStrings(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function decimalMilli(value: string): bigint { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); }
function formatMilli(value: bigint): string { return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`; }

function roundDecimal(value: string, scale: number): string {
  const [whole, fraction = ''] = value.split('.');
  const digits = fraction.padEnd(scale + 1, '0');
  const retained = digits.slice(0, scale) || '0';
  const rounded = BigInt(whole) * 10n ** BigInt(scale) + BigInt(retained) + (Number(digits[scale] ?? '0') >= 5 ? 1n : 0n);
  const base = 10n ** BigInt(scale);
  return `${rounded / base}.${(rounded % base).toString().padStart(scale, '0')}`;
}

function nutritionForGrams(per100g: string, grams: string): string {
  const [vWhole, vFraction = ''] = per100g.split('.');
  const [gWhole, gFraction = ''] = grams.split('.');
  const vScale = vFraction.length;
  const gScale = gFraction.length;
  const v = BigInt(vWhole + vFraction);
  const g = BigInt(gWhole + gFraction);
  const numerator = v * g;
  const denominator = 100n * 10n ** BigInt(gScale);
  const cents = numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
  void vScale; // Nutrition profile values are stored at scale 2 (numeric(...,2)).
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

async function loadMeals(tx: Tx, householdId: string, ids: string[]) {
  const rows = await tx.$queryRaw<MealRow[]>`SELECT "id", "userId", "mealType"::text AS "mealType", "eatenAt", "origin"::text AS "origin", "name" FROM "Meal" WHERE "householdId" = ${householdId}::uuid AND "id" = ANY(${ids}::uuid[]) ORDER BY "eatenAt", "id"`;
  const items = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT mi."mealId", mi."foodId", f."name" AS "foodName", mi."quantity"::text AS "quantity", mi."unit"::text AS "unit", mi."quantityG"::text AS "quantityG",
      mi."calories"::text AS "calories", mi."proteinG"::text AS "proteinG", mi."carbsG"::text AS "carbsG", mi."fatG"::text AS "fatG", mi."fiberG"::text AS "fiberG", mi."sugarG"::text AS "sugarG", mi."sodiumMg"::text AS "sodiumMg", mi."nutritionSnapshotAt"
    FROM "MealItem" mi JOIN "Food" f ON f."id" = mi."foodId" WHERE mi."householdId" = ${householdId}::uuid AND mi."mealId" = ANY(${ids}::uuid[]) ORDER BY f."name"`;
  return rows.map((meal) => ({ ...meal, items: items.filter((item) => item.mealId === meal.id) }));
}
