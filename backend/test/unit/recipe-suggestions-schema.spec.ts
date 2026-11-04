import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSchema, graphql, parse, validate } from 'graphql';

const schema = buildSchema(readFileSync(new URL('../../schema.graphql', import.meta.url), 'utf8'));
const query = `query {
  recipeSuggestions(first:1) {
    nodes {
      recipe { id name description servings prepTimeMin cookTimeMin difficulty cuisineId cuisineName }
      coverageRatio haveCount requiredCount safetyWarnings
      missing { foodId foodName status requiredAmount availableAmount unit aliases { id alias languageCode isPrimary } }
      expired { foodId foodName status requiredAmount availableAmount unit aliases { id alias languageCode isPrimary } }
      short { foodId missingAmount unit } unknown { foodId status knownAvailableAmount }
      optional { foodId status } assumedStaples { foodId status }
      expiringSoon { foodId expiryDay aliases { alias languageCode } }
    }
    totalCount hasNextPage endCursor missingStapleNames
  }
}`;

describe('recipe suggestions generated schema contract', () => {
  it('exposes the complete explanation contract with the existing FoodAlias type', () => {
    expect(validate(schema, parse(query))).toEqual([]);
    const fields = schema.getType('RecipeSuggestionIngredientType') as any;
    expect(String(fields.getFields().aliases.type)).toBe('[FoodAlias!]!');
    expect(String(fields.getFields().missingAmount.type)).toBe('Decimal');
  });

  it('executes actual schema selections and preserves nullable quantity-not-checked fields', async () => {
    const result = await graphql({ schema, source: query, rootValue: { recipeSuggestions: () => ({
      nodes: [{ recipe: { id: 'recipe', name: 'Recipe', description: null, servings: 1, prepTimeMin: null, cookTimeMin: 0,
        difficulty: 'EASY', cuisineId: null, cuisineName: null }, coverageRatio: 1, haveCount: 1, requiredCount: 1,
        missing: [], expired: [{ foodId: 'expired', foodName: 'tomato', status: 'EXPIRED', requiredAmount: '1.000', availableAmount: '0.000', unit: 'GRAM', aliases: [] }], short: [], assumedStaples: [], optional: [], expiringSoon: [], safetyWarnings: [],
        unknown: [{ foodId: 'food', status: 'UNKNOWN', knownAvailableAmount: '0.000' }] }],
      totalCount: 1, hasNextPage: false, endCursor: null, missingStapleNames: [],
    }) } });
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipeSuggestions).toMatchObject({ nodes: [{ coverageRatio: 1, expired: [{ foodId: 'expired', status: 'EXPIRED' }], unknown: [{ status: 'UNKNOWN', knownAvailableAmount: '0.000' }] }] });
  });
});
