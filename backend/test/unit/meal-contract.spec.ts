import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSchema, graphql, parse, validate } from 'graphql';

const schema = buildSchema(readFileSync(new URL('../../schema.graphql', import.meta.url), 'utf8'));
const input = { mealType: 'LUNCH', eatenAt: '2026-06-02T12:00:00Z', idempotencyKey: 'test',
  items: [{ foodId: 'food', amount: '3.000', unit: 'GRAM' }] };
const fields = '__typename ... on InsufficientStockType { foodId requested available unit }';

describe('meal and inventory additive GraphQL contract', () => {
  it('exposes optional metadata and defaults skipExpiredBatches to false on logMeal only', () => {
    const stock = schema.getType('InsufficientStockType') as any;
    expect(String(stock.getFields().foodId.type)).toBe('ID');
    expect(String(stock.getFields().requested.type)).toBe('Decimal');
    expect(String(stock.getFields().available.type)).toBe('Decimal!');
    expect(String(stock.getFields().unit.type)).toBe('Unit!');
    const meal = schema.getType('LogMealInputType') as any;
    expect(meal.getFields().skipExpiredBatches.defaultValue).toBe(false);
    expect((schema.getType('LogFamilyMealInputType') as any).getFields().skipExpiredBatches).toBeUndefined();
  });

  it.each(['logMeal', 'logFamilyMeal', 'consumeStock', 'discardStock'])('returns metadata through the actual %s schema union', async operation => {
    const type = operation === 'logMeal' ? 'LogMealInputType' : operation === 'logFamilyMeal' ? 'LogFamilyMealInputType' : 'InventoryStockInput';
    const variables = operation === 'logFamilyMeal' ? { ...input, totalServings: '1.000', shares: [{ userId: 'user', servings: '1.000' }] }
      : operation === 'logMeal' ? input : { ...input.items[0], idempotencyKey: 'test' };
    const source = `mutation($input:${type}!){${operation}(input:$input){${fields}}}`;
    expect(validate(schema, parse(source))).toEqual([]);
    const result = await graphql({ schema, source, variableValues: { input: variables }, rootValue: { [operation]: () => ({
      __typename: 'InsufficientStockType', foodId: 'food', requested: '3.000', available: '2.000', unit: 'GRAM',
    }) } });
    expect(result.errors).toBeUndefined();
    expect(result.data?.[operation]).toMatchObject({ foodId: 'food', requested: '3.000', available: '2.000', unit: 'GRAM' });
  });

  it('legacy selections remain valid and omitted option reaches the resolver as false', async () => {
    let flag: unknown;
    const source = 'mutation($input:LogMealInputType!){logMeal(input:$input){... on InsufficientStockType{available unit}}}';
    const result = await graphql({ schema, source, variableValues: { input }, rootValue: { logMeal: (args: any) => {
      flag = args.input.skipExpiredBatches;
      return { __typename: 'InsufficientStockType', available: '2.000', unit: 'GRAM' };
    } } });
    expect(result.errors).toBeUndefined(); expect(flag).toBe(false);
    expect(result.data?.logMeal).toEqual({ available: '2.000', unit: 'GRAM' });
  });
});
