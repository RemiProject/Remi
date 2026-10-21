import { describe, expect, it } from 'vitest';
import { SAFETY_FILTERS, SafetyEvaluator, type SafetyProfileSnapshot } from '@/modules/safety/domain/safety-evaluator.js';

describe('SafetyEvaluator', () => {
  const evaluator = new SafetyEvaluator();

  it('fails closed for allergies and configured avoid rules, while warning on limits and dislikes', () => {
    const profile: SafetyProfileSnapshot = {
      allergyFoodIds: ['egg'], allergyCategoryIds: ['nuts'], dislikedFoodIds: ['tomato'], dislikedCategoryIds: ['spice'],
      dietaryPreferences: ['VEGETARIAN'],
      healthConditions: [
        { status: 'ACTIVE', rules: [{ ruleType: 'AVOID', targetType: 'CATEGORY', categoryId: 'meat' }] },
        { status: 'CONTROLLED', rules: [{ ruleType: 'LIMIT', targetType: 'NUTRIENT', nutrient: 'SODIUM', maxPer100g: 300 }] },
        { status: 'REMISSION', rules: [{ ruleType: 'PREFER', targetType: 'FOOD', foodId: 'beans' }] },
        { status: 'RESOLVED', rules: [{ ruleType: 'AVOID', targetType: 'FOOD', foodId: 'tomato' }] },
      ],
      dietaryRules: [{ dietaryPreference: 'VEGETARIAN', rule: { ruleType: 'AVOID', targetType: 'CATEGORY', categoryId: 'meat' } }],
    };
    const results = evaluator.evaluate(profile, [
      { foodId: 'egg', categoryIds: ['protein'], nutrientsPer100g: { SODIUM: 450 } },
      { foodId: 'tomato', categoryIds: ['spice'], nutrientsPer100g: { SODIUM: 10 } },
      { foodId: 'beef', categoryIds: ['meat'], nutrientsPer100g: { SODIUM: 20 } },
      { foodId: 'beans', categoryIds: ['legumes'], nutrientsPer100g: { SODIUM: 20 } },
    ]);
    const byFilter = Object.fromEntries(results.map((result) => [result.filterType, result]));
    expect(results.map((result) => result.filterType)).toEqual([...SAFETY_FILTERS]);
    expect(byFilter.ALLERGY_FOOD.result).toBe('FAILED');
    expect(byFilter.DISLIKE_FOOD.result).toBe('WARNED');
    expect(byFilter.DISLIKE_CATEGORY.result).toBe('WARNED');
    expect(byFilter.HEALTH_AVOID.result).toBe('FAILED');
    expect(byFilter.HEALTH_LIMIT.result).toBe('WARNED');
    expect(byFilter.HEALTH_PREFER.result).toBe('WARNED');
    expect(byFilter.DIETARY.result).toBe('FAILED');
  });

  it('returns all eight passing filters when there is no matching profile rule', () => {
    const profile: SafetyProfileSnapshot = {
      allergyFoodIds: [], allergyCategoryIds: [], dislikedFoodIds: [], dislikedCategoryIds: [],
      dietaryPreferences: [], healthConditions: [], dietaryRules: [],
    };
    expect(evaluator.evaluate(profile, [{ foodId: 'rice', categoryIds: ['grain'] }]).map((row) => row.result))
      .toEqual(Array.from({ length: 8 }, () => 'PASSED'));
  });
});
