import { buildSchema, parse, specifiedRules, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import { complexityLimit } from '@/platform/graphql/complexity-limit.js';

const schema = buildSchema(`
  type Query { foods(first: Int): [Food!]! }
  type Food { recipes(first: Int): [Recipe!]! }
  type Recipe { ingredients: [Ingredient!]! }
  type Ingredient { id: ID! }
`);

describe('GraphQL complexity budget', () => {
  it('accepts bounded nested list queries under the configured budget', () => {
    const document = parse('{ foods(first: 2) { recipes(first: 2) { ingredients { id } } } }');
    expect(validate(schema, document, [...specifiedRules, complexityLimit(50)])).toHaveLength(0);
  });

  it('rejects nested list fanout above the configured budget', () => {
    const document = parse('{ foods(first: 50) { recipes(first: 50) { ingredients { id } } } }');
    const errors = validate(schema, document, [...specifiedRules, complexityLimit(100)]);
    expect(errors.some((error) => error.extensions.code === 'QUERY_TOO_COMPLEX')).toBe(true);
  });

  it('counts fragment selections and caps variable list sizes', () => {
    const document = parse('query($n: Int = 500) { foods(first: $n) { ...FoodDetails } } fragment FoodDetails on Food { recipes { ingredients { id } } }');
    const errors = validate(schema, document, [...specifiedRules, complexityLimit(100)]);
    expect(errors.some((error) => error.extensions.code === 'QUERY_TOO_COMPLEX')).toBe(true);
  });
});
