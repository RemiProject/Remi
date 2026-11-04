import { describe, expect, it } from 'vitest';
import {
  compareRecipeMatches, matchAndRankRecipes,
  type MatchingBatch, type MatchingIngredient, type MatchingRecipe, type RecipeMatchingInput,
} from '@/modules/recipes/domain/recipe-matcher.js';
import { resolveAssumedStaples } from '@/modules/recipes/domain/assumed-staples.js';
import { Unit } from '@/shared/food-unit.js';

const ingredient = (foodId: string, quantity = '1', unit = Unit.GRAM, extra: Partial<MatchingIngredient> = {}): MatchingIngredient => ({ foodId, quantity, unit, ...extra });
const recipe = (id: string, ingredients: readonly MatchingIngredient[], extra: Partial<MatchingRecipe> = {}): MatchingRecipe => ({
  id, name: id, servings: 4, prepTimeMin: 5, cookTimeMin: 10, ingredients, ...extra,
});
const batch = (foodId: string, quantity = '1', unit = Unit.GRAM, extra: Partial<MatchingBatch> = {}): MatchingBatch => ({
  id: `${foodId}-batch`, foodId, quantity, unit, estimatedExpiryAt: null, ...extra,
});
const run = (recipes: readonly MatchingRecipe[], batches: readonly MatchingBatch[] = [], extra: Partial<RecipeMatchingInput> = {}) => matchAndRankRecipes({
  recipes, batches, householdTimezone: 'Africa/Cairo', now: new Date('2026-06-01T21:30:00Z'), staples: new Set(), ...extra,
});
const expiry = (day: string) => new Date(`${day}T12:00:00Z`);

describe('recipe matching', () => {
  it('matches exact food IDs and original recipe quantities, without dividing by servings', () => {
    const result = run([recipe('salad', [ingredient('tomato', '4', Unit.PIECE)])], [batch('tomato', '4', Unit.PIECE)])[0];
    expect(result).toMatchObject({ recipeId: 'salad', servings: 4, haveCount: 1, requiredCount: 1, missingFoodIds: [], shortItems: [], unknownItems: [] });
    expect(result.requiredIngredients).toEqual([{ foodId: 'tomato', requiredAmount: '4.000', unit: Unit.PIECE, status: 'ENOUGH', availableAmount: '4.000' }]);
    expect(run([recipe('salad', [ingredient('tomato', '4', Unit.PIECE)])], [batch('tomato', '1', Unit.PIECE)])[0].shortItems[0].missingAmount).toBe('3.000');
  });

  it('reports partial coverage and never matches names, similar IDs or substitutions', () => {
    const result = run([recipe('mixed', [ingredient('tomato'), ingredient('rice'), ingredient('salt-substitute')])], [
      batch('tomato', '2'), batch('white-rice', '100'), batch('salt', '100'),
    ])[0];
    expect(result).toMatchObject({ haveCount: 1, requiredCount: 3, missingFoodIds: ['rice', 'salt-substitute'] });
  });

  it('reports all missing, including food represented only by zero balances', () => {
    const result = run([recipe('empty', [ingredient('a'), ingredient('b')])], [batch('a', '0')])[0];
    expect(result).toMatchObject({ haveCount: 0, requiredCount: 2, missingFoodIds: ['a', 'b'] });
    expect(result.requiredIngredients.every(item => item.status === 'MISSING')).toBe(true);
  });

  it.each([
    { required: '1', recipeUnit: Unit.KILOGRAM, stock: '250', stockUnit: Unit.GRAM, available: '0.250', missing: '0.750' },
    { required: '1000', recipeUnit: Unit.GRAM, stock: '0.25', stockUnit: Unit.KILOGRAM, available: '250.000', missing: '750.000' },
    { required: '1', recipeUnit: Unit.LITER, stock: '250', stockUnit: Unit.MILLILITER, available: '0.250', missing: '0.750' },
    { required: '1000', recipeUnit: Unit.MILLILITER, stock: '0.25', stockUnit: Unit.LITER, available: '250.000', missing: '750.000' },
  ])('reports SHORT in the recipe unit: $stock $stockUnit / $required $recipeUnit', ({ required, recipeUnit, stock, stockUnit, available, missing }) => {
    const result = run([recipe('short', [ingredient('food', required, recipeUnit)])], [batch('food', stock, stockUnit)])[0];
    expect(result).toMatchObject({ haveCount: 0, requiredCount: 1, missingFoodIds: [] });
    expect(result.shortItems).toEqual([{ foodId: 'food', requiredAmount: `${required}.000`, unit: recipeUnit, status: 'SHORT', availableAmount: available, missingAmount: missing }]);
  });

  it.each([
    { recipeUnit: Unit.GRAM, stockUnit: Unit.PIECE },
    { recipeUnit: Unit.PIECE, stockUnit: Unit.GRAM },
    { recipeUnit: Unit.GRAM, stockUnit: Unit.MILLILITER },
    { recipeUnit: Unit.MILLILITER, stockUnit: Unit.GRAM },
  ])('reports UNKNOWN for absent conversion data: $stockUnit -> $recipeUnit', ({ recipeUnit, stockUnit }) => {
    const result = run([recipe('unknown', [ingredient('food', '1', recipeUnit)])], [batch('food', '10', stockUnit)])[0];
    expect(result).toMatchObject({ haveCount: 1, requiredCount: 1, missingFoodIds: [], shortItems: [] });
    expect(result.unknownItems).toEqual([{ foodId: 'food', requiredAmount: '1.000', unit: recipeUnit, status: 'UNKNOWN', knownAvailableAmount: '0.000', unconvertibleBatchIds: ['food-batch'] }]);
  });

  it('uses supplied catalog piece weight and density without guessing', () => {
    const result = run([recipe('converted', [
      ingredient('carrot', '100', Unit.GRAM, { gramsPerPiece: '61' }),
      ingredient('oil', '100', Unit.GRAM, { densityGPerMl: '0.913' }),
    ])], [batch('carrot', '2', Unit.PIECE), batch('oil', '100', Unit.MILLILITER)])[0];
    expect(result.haveCount).toBe(1);
    expect(result.requiredIngredients[0]).toMatchObject({ status: 'ENOUGH', availableAmount: '122.000' });
    expect(result.shortItems[0]).toMatchObject({ availableAmount: '91.300', missingAmount: '8.700' });
  });

  it('keeps UNKNOWN explicit when some batches convert and others cannot', () => {
    const result = run([recipe('mixed', [ingredient('food')])], [
      batch('food', '2', Unit.GRAM), batch('food', '1', Unit.PIECE, { id: 'piece' }),
    ])[0];
    expect(result.haveCount).toBe(1);
    expect(result.unknownItems[0]).toMatchObject({ knownAvailableAmount: '2.000', unconvertibleBatchIds: ['piece'] });
  });

  it('reports optional ingredients separately without affecting coverage, missing lists or expiry ranking', () => {
    const result = run([recipe('optional', [ingredient('a'), ingredient('b', '1', Unit.GRAM, { optional: true }), ingredient('c', '1', Unit.GRAM, { optional: true })])], [
      batch('a'), batch('c', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-02') }),
    ])[0];
    expect(result).toMatchObject({ haveCount: 1, requiredCount: 1, missingFoodIds: [], expiringSoonFoods: [] });
    expect(result.optionalIngredients.map(item => item.status)).toEqual(['MISSING', 'ENOUGH']);
  });

  it('assumes only catalog-resolved staple IDs and excludes them from coverage and expiry ranking', () => {
    const staples = resolveAssumedStaples([{ id: 'water-id', name: 'water' }, { id: 'salt-id', name: 'salt' }, { id: 'pepper-id', name: 'black pepper' }]).foodIds;
    const result = run([recipe('staples', [ingredient('water-id'), ingredient('salt-id'), ingredient('pepper-id'), ingredient('other-pepper')])], [
      batch('salt-id', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-02') }),
    ], { staples })[0];
    expect(result).toMatchObject({ haveCount: 0, requiredCount: 1, missingFoodIds: ['other-pepper'], expiringSoonFoods: [] });
    expect(result.assumedStaples.map(item => [item.foodId, item.status])).toEqual([
      ['water-id', 'ASSUMED'], ['salt-id', 'ASSUMED'], ['pepper-id', 'ASSUMED'],
    ]);
  });

  it('sums all positive batches exactly, including mixed units and undated batches', () => {
    const result = run([recipe('sum', [ingredient('food', '1000')])], [
      batch('food', '0.333', Unit.KILOGRAM, { id: 'a' }), batch('food', '0.333', Unit.KILOGRAM, { id: 'b' }),
      batch('food', '334', Unit.GRAM, { id: 'c' }), batch('food', '0', Unit.GRAM, { id: 'zero' }),
    ])[0];
    expect(result.requiredIngredients[0]).toMatchObject({ status: 'ENOUGH', availableAmount: '1000.000' });
  });

  it('aggregates before converter rounding so splitting a source unit into batches is invariant', () => {
    const recipes = [recipe('small', [ingredient('food', '0.001', Unit.KILOGRAM)])];
    expect(run(recipes, [batch('food', '1', Unit.GRAM)])).toEqual(run(recipes, [
      batch('food', '0.4', Unit.GRAM, { id: 'a' }), batch('food', '0.6', Unit.GRAM, { id: 'b' }),
    ]));
  });

  it('treats a known sub-precision conversion as SHORT, not missing conversion data', () => {
    const result = run([recipe('tiny', [ingredient('food', '0.001', Unit.KILOGRAM)])], [batch('food', '0.001', Unit.GRAM)])[0];
    expect(result.shortItems[0]).toMatchObject({ availableAmount: '0.000', missingAmount: '0.001' });
    expect(result.unknownItems).toEqual([]);
  });

  it.each([
    { unit: Unit.TABLESPOON, quantity: '2', ml: '30' },
    { unit: Unit.TEASPOON, quantity: '3', ml: '15' },
  ])('supports $unit ingredients through the existing kitchen constants', ({ unit, quantity, ml }) => {
    expect(run([recipe('spoon', [ingredient('oil', quantity, unit)])], [batch('oil', ml, Unit.MILLILITER)])[0].requiredIngredients[0])
      .toMatchObject({ status: 'ENOUGH', availableAmount: `${quantity}.000` });
  });

  it('rejects invalid inputs and propagates conversion errors other than missing factors', () => {
    for (const value of ['-1', 'NaN', '1.2345']) {
      expect(() => run([recipe('bad', [ingredient('food', value)])])).toThrow();
    }
    expect(() => run([recipe('bad', [ingredient('food', '0')])])).toThrow();
    expect(() => run([recipe('bad', [ingredient('food', '1', Unit.GRAM, { gramsPerPiece: 'bad' })])], [batch('food', '1', Unit.PIECE)])).toThrow();
    expect(() => run([], [], { householdTimezone: 'Invalid/Timezone' })).toThrow();
    expect(() => run([], [], { now: new Date('invalid') })).toThrow();
  });
});

describe('household calendar expiry', () => {
  it('ignores prior-day batches but keeps earlier timestamps today and batches without expiry', () => {
    const result = run([recipe('expiry', [ingredient('food', '3')])], [
      batch('food', '100', Unit.GRAM, { id: 'yesterday', estimatedExpiryAt: new Date('2026-06-01T20:59:59Z') }),
      batch('food', '1', Unit.GRAM, { id: 'today', estimatedExpiryAt: new Date('2026-06-01T21:00:00Z') }),
      batch('food', '1', Unit.GRAM, { id: 'undated' }),
    ])[0];
    expect(result.shortItems[0]).toMatchObject({ availableAmount: '2.000', missingAmount: '1.000' });
    expect(result.expiringSoonFoods).toEqual([{ foodId: 'food', expiryDay: '2026-06-02' }]);
    expect(run([recipe('expired-only', [ingredient('food')])], [batch('food', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-01') })])[0].requiredIngredients[0].status).toBe('EXPIRED');
  });

  it('distinguishes expired required/optional foods from absent/zero stock without changing coverage or ranking', () => {
    const recipes = [recipe('a', [ingredient('food'), ingredient('optional', '1', Unit.GRAM, { optional: true }), ingredient('absent'), ingredient('zero')]), recipe('b', [ingredient('other')])];
    const absent = run(recipes);
    const result = run(recipes, [batch('food', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-01') }),
      batch('food', '0'), batch('optional', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-01') }),
      batch('zero', '0', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-01') })]);
    expect(result.map(r => [r.recipeId, r.haveCount, r.requiredCount])).toEqual(absent.map(r => [r.recipeId, r.haveCount, r.requiredCount]));
    expect(result[0].requiredIngredients.map(i => i.status)).toEqual(['EXPIRED', 'MISSING', 'MISSING']);
    expect(result[0].optionalIngredients[0].status).toBe('EXPIRED');
    expect(result[0].missingFoodIds).toEqual(['absent', 'zero']);
    expect(result[0].expiringSoonFoods).toEqual([]);
  });

  it.each([
    { quantity: '2', unit: Unit.GRAM, status: 'ENOUGH' },
    { quantity: '0.5', unit: Unit.GRAM, status: 'SHORT' },
    { quantity: '1', unit: Unit.PIECE, status: 'UNKNOWN' },
  ])('uses valid stock alongside expired batches: $status', ({ quantity, unit, status }) => {
    const result = run([recipe('mixed', [ingredient('food')])], [
      batch('food', '100', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-01') }), batch('food', quantity, unit, { id: 'valid' }),
    ])[0];
    expect(result.requiredIngredients[0].status).toBe(status);
  });

  it('includes today and +3 days, excludes +4 days, and counts each food once across batches', () => {
    const result = run([recipe('boundaries', ['today', 'three', 'four', 'undated'].map(id => ingredient(id)))], [
      batch('today', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-02') }),
      batch('today', '1', Unit.GRAM, { id: 'later', estimatedExpiryAt: expiry('2026-06-05') }),
      batch('three', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-05') }),
      batch('four', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-06') }), batch('undated'),
    ])[0];
    expect(result.expiringSoonFoods).toEqual([{ foodId: 'three', expiryDay: '2026-06-05' }, { foodId: 'today', expiryDay: '2026-06-02' }]);
    expect(result.haveCount).toBe(4);
  });

  it('uses the household timezone rather than UTC or the host timezone', () => {
    const recipes = [recipe('zone', [ingredient('food')])];
    const batches = [batch('food', '1', Unit.GRAM, { estimatedExpiryAt: new Date('2026-06-01T20:59:59Z') })];
    expect(run(recipes, batches)[0].requiredIngredients[0].status).toBe('EXPIRED');
    expect(run(recipes, batches, { householdTimezone: 'America/Los_Angeles' })[0].haveCount).toBe(1);
  });

  it('uses calendar days across the Cairo DST transition, not a 72-hour interval', () => {
    const result = run([recipe('dst', [ingredient('three'), ingredient('four')])], [
      batch('three', '1', Unit.GRAM, { estimatedExpiryAt: new Date('2026-04-26T12:00:00Z') }),
      // Only 72 hours after now, but already April 27 locally: four calendar days later.
      batch('four', '1', Unit.GRAM, { estimatedExpiryAt: new Date('2026-04-26T21:30:00Z') }),
    ], { now: new Date('2026-04-23T21:30:00Z') })[0];
    expect(result.expiringSoonFoods).toEqual([{ foodId: 'three', expiryDay: '2026-04-26' }]);
  });
});

describe('recipe ranking', () => {
  it('orders by coverage ratio, expiring required foods, time, name and ID in that order', () => {
    const both = [ingredient('a'), ingredient('b')];
    const recipes = [
      recipe('half', [ingredient('a'), ingredient('missing')], { prepTimeMin: 0, cookTimeMin: 0 }),
      recipe('z', both, { name: 'Same', prepTimeMin: 1, cookTimeMin: 1 }),
      recipe('a', both, { name: 'Same', prepTimeMin: 1, cookTimeMin: 1 }),
      recipe('name-first', both, { name: 'Alpha', prepTimeMin: 1, cookTimeMin: 1 }),
      recipe('slower', both, { prepTimeMin: 5, cookTimeMin: 10 }),
      recipe('less-soon', [ingredient('a')], { prepTimeMin: 0, cookTimeMin: 0 }),
      recipe('third', [ingredient('a'), ingredient('missing'), ingredient('another')]),
    ];
    const batches = [batch('a', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-02') }), batch('b', '1', Unit.GRAM, { estimatedExpiryAt: expiry('2026-06-05') })];
    const result = run(recipes, batches);
    expect(result.map(item => item.recipeId)).toEqual(['name-first', 'a', 'z', 'slower', 'less-soon', 'half', 'third']);
    expect(result.map(item => [item.haveCount, item.requiredCount])).toEqual([[2, 2], [2, 2], [2, 2], [2, 2], [1, 1], [1, 2], [1, 3]]);
  });

  it('ranks optional/staples-only recipes after even zero-coverage counted recipes', () => {
    const result = run([
      recipe('missing', [ingredient('missing')], { prepTimeMin: null }),
      recipe('assumed', [ingredient('salt')], { prepTimeMin: 0, cookTimeMin: 0 }),
      recipe('optional', [ingredient('optional', '1', Unit.GRAM, { optional: true })], { prepTimeMin: 0, cookTimeMin: 0 }),
    ], [], { staples: new Set(['salt']) });
    expect(result.map(item => item.recipeId)).toEqual(['missing', 'assumed', 'optional']);
    expect(result.slice(1).map(item => [item.haveCount, item.requiredCount])).toEqual([[0, 0], [0, 0]]);
    expect(result[1].assumedStaples[0].status).toBe('ASSUMED');
    expect(result[2].optionalIngredients[0].status).toBe('MISSING');
    expect(run([recipe('empty', []),
      recipe('missing', [ingredient('missing')]), recipe('assumed', [ingredient('salt')]),
    ], [], { staples: new Set(['salt']) }).map(item => item.recipeId)).toEqual(['missing', 'assumed', 'empty']);
  });

  it('counts UNKNOWN as HAVE, keeps SHORT not-have, and preserves quantity-not-checked explanations', () => {
    const result = run([
      recipe('short', [ingredient('short', '2')]),
      recipe('unknown', [ingredient('piece', '100', Unit.GRAM)]),
    ], [batch('short'), batch('piece', '1', Unit.PIECE)]);
    expect(result.map(item => item.recipeId)).toEqual(['unknown', 'short']);
    expect(result[0]).toMatchObject({ haveCount: 1, requiredCount: 1, unknownItems: [{ foodId: 'piece', status: 'UNKNOWN' }] });
    expect(result[0].requiredIngredients[0].status).toBe('UNKNOWN');
    expect(result[1]).toMatchObject({ haveCount: 0, requiredCount: 1, shortItems: [{ missingAmount: '1.000' }] });
  });

  it('prefers fewer required UNKNOWN items on equal coverage, before expiry, time or name', () => {
    const result = run([
      recipe('two-unknown', [ingredient('a'), ingredient('b')], { name: 'A', prepTimeMin: 0, cookTimeMin: 0 }),
      recipe('one-unknown', [ingredient('a')], { name: 'B', prepTimeMin: 0, cookTimeMin: 0 }),
      recipe('known', [ingredient('known')], { name: 'Z', prepTimeMin: 100, cookTimeMin: 100 }),
    ], [
      batch('a', '1', Unit.PIECE, { estimatedExpiryAt: expiry('2026-06-02') }),
      batch('b', '1', Unit.PIECE, { estimatedExpiryAt: expiry('2026-06-03') }), batch('known'),
    ]);
    expect(result.map(item => item.recipeId)).toEqual(['known', 'one-unknown', 'two-unknown']);
    expect(result.map(item => item.unknownItems.length)).toEqual([0, 1, 2]);
    expect(result.map(item => [item.haveCount, item.requiredCount])).toEqual([[1, 1], [1, 1], [2, 2]]);
  });

  it('does not penalize optional UNKNOWN ingredients or let unknown count override coverage', () => {
    const result = run([
      recipe('half-known', [ingredient('known'), ingredient('missing')]),
      recipe('full-unknown', [ingredient('piece')]),
      recipe('full-known', [ingredient('known'), ingredient('piece', '1', Unit.GRAM, { optional: true })]),
    ], [batch('known'), batch('piece', '1', Unit.PIECE)]);
    expect(result.map(item => item.recipeId)).toEqual(['full-known', 'full-unknown', 'half-known']);
    expect(result[0].unknownItems).toEqual([]);
    expect(result[0].optionalIngredients[0].status).toBe('UNKNOWN');
  });

  it('places unknown total times last, while zero minutes is a valid fastest time', () => {
    const result = run([
      recipe('unknown-prep', [], { prepTimeMin: null }), recipe('unknown-cook', [], { cookTimeMin: null }),
      recipe('zero', [], { prepTimeMin: 0, cookTimeMin: 0 }), recipe('known', []),
    ]);
    expect(result.map(item => item.recipeId)).toEqual(['zero', 'known', 'unknown-cook', 'unknown-prep']);
    expect(result.slice(2).every(item => item.totalTimeMin === null)).toBe(true);
  });

  it('uses exact ratio comparison rather than comparing haveCount or rounding ratios', () => {
    const base = run([recipe('base', [])])[0];
    expect(compareRecipeMatches({ ...base, haveCount: 2, requiredCount: 3 }, { ...base, haveCount: 3, requiredCount: 5 })).toBe(-1);
    expect(compareRecipeMatches({ ...base, haveCount: 1, requiredCount: 3 }, { ...base, haveCount: 2, requiredCount: 6 })).toBe(0);
  });

  it('is repeatable, independent of recipe/batch order, and never mutates frozen inputs', () => {
    const recipes = Object.freeze([
      Object.freeze(recipe('b', Object.freeze([Object.freeze(ingredient('food'))]), { name: 'Same' })),
      Object.freeze(recipe('a', Object.freeze([Object.freeze(ingredient('food'))]), { name: 'Same' })),
    ]);
    const batches = Object.freeze([
      Object.freeze(batch('food', '0.1', Unit.GRAM, { id: 'a', estimatedExpiryAt: expiry('2026-06-05') })),
      Object.freeze(batch('food', '0.9', Unit.GRAM, { id: 'b', estimatedExpiryAt: expiry('2026-06-02') })),
    ]);
    const before = JSON.stringify({ recipes, batches });
    const expected = run(recipes, batches);
    expect(run([...recipes].reverse(), [...batches].reverse())).toEqual(expected);
    expect(run(recipes, batches)).toEqual(expected);
    expect(expected.map(item => item.recipeId)).toEqual(['a', 'b']);
    expect(JSON.stringify({ recipes, batches })).toBe(before);
  });
});
