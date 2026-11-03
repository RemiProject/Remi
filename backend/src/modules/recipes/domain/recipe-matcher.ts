import { UnitConverter } from '@/modules/units/units.public.js';
import { DomainError } from '@/shared/domain-error.js';
import { Unit } from '@/shared/food-unit.js';

export interface MatchingIngredient {
  readonly foodId: string;
  readonly quantity: string;
  readonly unit: Unit;
  readonly optional?: boolean;
  readonly gramsPerPiece?: string | null;
  readonly densityGPerMl?: string | null;
}

export interface MatchingRecipe {
  readonly id: string;
  readonly name: string;
  readonly servings: number;
  readonly prepTimeMin: number | null;
  readonly cookTimeMin: number | null;
  readonly ingredients: readonly MatchingIngredient[];
}

/** Already scoped to one household by the caller; no household selection or IO here. */
export interface MatchingBatch {
  readonly id: string;
  readonly foodId: string;
  readonly quantity: string;
  readonly unit: Unit;
  readonly estimatedExpiryAt: Date | null;
}

type IngredientAmount = { foodId: string; requiredAmount: string; unit: Unit };
export type IngredientMatch = IngredientAmount & (
  | { status: 'ENOUGH'; availableAmount: string }
  | { status: 'SHORT'; availableAmount: string; missingAmount: string }
  | { status: 'MISSING'; availableAmount: '0.000' }
  | { status: 'UNKNOWN'; knownAvailableAmount: string; unconvertibleBatchIds: string[] }
  | { status: 'ASSUMED' }
);
export type ExpiringSoonFood = { foodId: string; expiryDay: string };

export interface RecipeMatch {
  recipeId: string;
  name: string;
  servings: number;
  totalTimeMin: number | null;
  requiredIngredients: IngredientMatch[];
  optionalIngredients: IngredientMatch[];
  /** ENOUGH or UNKNOWN: the food is owned, even when its quantity cannot be checked. */
  haveCount: number;
  requiredCount: number;
  missingFoodIds: string[];
  shortItems: Extract<IngredientMatch, { status: 'SHORT' }>[];
  unknownItems: Extract<IngredientMatch, { status: 'UNKNOWN' }>[];
  assumedStaples: Extract<IngredientMatch, { status: 'ASSUMED' }>[];
  /** Earliest eligible expiry per non-optional, non-assumed food; each food counts once. */
  expiringSoonFoods: ExpiringSoonFood[];
}

export interface RecipeMatchingInput {
  readonly recipes: readonly MatchingRecipe[];
  readonly batches: readonly MatchingBatch[];
  readonly householdTimezone: string;
  readonly now: Date;
  readonly staples: ReadonlySet<string>;
}

type AvailableBatch = MatchingBatch & { expiryDay: string | null };
const converter = new UnitConverter();
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Original recipe servings, exact food IDs, converter rounding, and no implicit current time. */
export function matchAndRankRecipes(input: RecipeMatchingInput): RecipeMatch[] {
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: input.householdTimezone, calendar: 'iso8601', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const today = calendarDay(input.now, dayFormatter);
  const soonThrough = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const byFood = new Map<string, AvailableBatch[]>();
  for (const batch of input.batches) {
    if (milli(batch.quantity) <= 0n) continue;
    const expiryDay = batch.estimatedExpiryAt === null ? null : calendarDay(batch.estimatedExpiryAt, dayFormatter);
    // A timestamp earlier today is still available for the entire household calendar day.
    if (expiryDay !== null && expiryDay < today) continue;
    const group = byFood.get(batch.foodId) ?? [];
    group.push({ ...batch, expiryDay });
    byFood.set(batch.foodId, group);
  }

  return input.recipes.map((recipe): RecipeMatch => {
    const requiredIngredients: IngredientMatch[] = [];
    const optionalIngredients: IngredientMatch[] = [];
    const assumedStaples: RecipeMatch['assumedStaples'] = [];
    const soon = new Map<string, string>();
    for (const ingredient of recipe.ingredients) {
      const match = matchIngredient(ingredient, byFood.get(ingredient.foodId) ?? [], input.staples);
      if (ingredient.optional) optionalIngredients.push(match);
      else requiredIngredients.push(match);
      if (match.status === 'ASSUMED') assumedStaples.push(match);
      if (ingredient.optional || match.status === 'ASSUMED') continue;
      for (const batch of byFood.get(ingredient.foodId) ?? []) {
        if (batch.expiryDay !== null && batch.expiryDay <= soonThrough) {
          const previous = soon.get(ingredient.foodId);
          if (!previous || batch.expiryDay < previous) soon.set(ingredient.foodId, batch.expiryDay);
        }
      }
    }
    return {
      recipeId: recipe.id, name: recipe.name, servings: recipe.servings,
      totalTimeMin: recipe.prepTimeMin === null || recipe.cookTimeMin === null ? null : recipe.prepTimeMin + recipe.cookTimeMin,
      requiredIngredients, optionalIngredients,
      haveCount: requiredIngredients.filter((item) => item.status === 'ENOUGH' || item.status === 'UNKNOWN').length,
      requiredCount: requiredIngredients.filter((item) => item.status !== 'ASSUMED').length,
      missingFoodIds: requiredIngredients.filter((item) => item.status === 'MISSING').map((item) => item.foodId),
      shortItems: requiredIngredients.filter((item): item is RecipeMatch['shortItems'][number] => item.status === 'SHORT'),
      unknownItems: requiredIngredients.filter((item): item is RecipeMatch['unknownItems'][number] => item.status === 'UNKNOWN'),
      assumedStaples,
      expiringSoonFoods: [...soon].sort(([a], [b]) => compareText(a, b)).map(([foodId, expiryDay]) => ({ foodId, expiryDay })),
    };
  }).sort(compareRecipeMatches);
}

/** Counted requirements first, then exact coverage, fewer unknowns, expiry, time, name and ID. */
export function compareRecipeMatches(a: RecipeMatch, b: RecipeMatch): number {
  if ((a.requiredCount === 0) !== (b.requiredCount === 0)) return a.requiredCount === 0 ? 1 : -1;
  const aHave = BigInt(a.haveCount);
  const bHave = BigInt(b.haveCount);
  const aRequired = BigInt(a.requiredCount);
  const bRequired = BigInt(b.requiredCount);
  const left = aHave * bRequired;
  const right = bHave * aRequired;
  if (left !== right) return left > right ? -1 : 1;
  return a.unknownItems.length - b.unknownItems.length
    || b.expiringSoonFoods.length - a.expiringSoonFoods.length
    || (a.totalTimeMin ?? Infinity) - (b.totalTimeMin ?? Infinity)
    || compareText(a.name, b.name) || compareText(a.recipeId, b.recipeId);
}

function matchIngredient(ingredient: MatchingIngredient, batches: AvailableBatch[], staples: ReadonlySet<string>): IngredientMatch {
  const required = milli(ingredient.quantity);
  if (required <= 0n) throw new DomainError('INVALID_QUANTITY', 'Recipe quantities must be positive.');
  const base: IngredientAmount = { foodId: ingredient.foodId, requiredAmount: formatMilli(required), unit: ingredient.unit };
  if (staples.has(ingredient.foodId)) return { ...base, status: 'ASSUMED' };
  if (!batches.length) return { ...base, status: 'MISSING', availableAmount: '0.000' };

  // Sum identical source units before conversion so splitting stock into batches cannot change rounding.
  const byUnit = new Map<Unit, { amount: bigint; batchIds: string[] }>();
  for (const batch of batches) {
    const group = byUnit.get(batch.unit) ?? { amount: 0n, batchIds: [] };
    group.amount += milli(batch.quantity);
    group.batchIds.push(batch.id);
    byUnit.set(batch.unit, group);
  }
  let available = 0n;
  const unconvertibleBatchIds: string[] = [];
  for (const [unit, group] of byUnit) {
    try {
      available += milli(converter.convert(formatMilli(group.amount), unit, ingredient.unit, ingredient));
    } catch (error) {
      if (error instanceof DomainError && ['UNIT_NOT_CONVERTIBLE', 'UNIT_CONVERSION_UNAVAILABLE'].includes(error.code)) {
        unconvertibleBatchIds.push(...group.batchIds);
      } else if (!(error instanceof DomainError && error.code === 'INVALID_QUANTITY'
        && error.message === 'Quantity rounds to zero at three decimal places.')) {
        throw error;
      }
      // A known conversion below the converter's precision contributes zero, not UNKNOWN.
    }
  }
  if (unconvertibleBatchIds.length) return {
    ...base, status: 'UNKNOWN', knownAvailableAmount: formatMilli(available),
    unconvertibleBatchIds: unconvertibleBatchIds.sort(compareText),
  };
  return available >= required
    ? { ...base, status: 'ENOUGH', availableAmount: formatMilli(available) }
    : { ...base, status: 'SHORT', availableAmount: formatMilli(available), missingAmount: formatMilli(required - available) };
}

function milli(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) throw new DomainError('INVALID_QUANTITY', 'Quantities must be nonnegative decimals with at most three decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function formatMilli(value: bigint): string {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;
}

function calendarDay(date: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
