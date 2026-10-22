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

  describe('multi-category foods and product label tags (B17A)', () => {
    const base: SafetyProfileSnapshot = {
      allergyFoodIds: [], allergyCategoryIds: [], dislikedFoodIds: [], dislikedCategoryIds: [],
      dietaryPreferences: [], healthConditions: [], dietaryRules: [],
    };
    const verdict = (profile: SafetyProfileSnapshot, ingredient: Parameters<SafetyEvaluator['evaluate']>[1][number], filter: string) =>
      evaluator.evaluate(profile, [ingredient]).find((v) => v.filterType === filter)!.result;

    it('a gluten-free diet blocks cake through its extra membership but lets rice through', () => {
      const profile = { ...base, dietaryPreferences: ['GLUTEN_FREE'], dietaryRules: [{ dietaryPreference: 'GLUTEN_FREE', rule: { ruleType: 'AVOID' as const, targetType: 'CATEGORY' as const, categoryId: 'gluten' } }] };
      expect(verdict(profile, { foodId: 'cake', categoryIds: ['bakery', 'gluten', 'dairy', 'eggs'] }, 'DIETARY')).toBe('FAILED');
      expect(verdict(profile, { foodId: 'rice', categoryIds: ['grains'] }, 'DIETARY')).toBe('PASSED');
    });

    it('"may contain nuts" blocks a severe nut allergy and only warns a mild one', () => {
      const biscuit = { foodId: 'biscuit', categoryIds: ['bakery', 'gluten'], mayContainCategoryIds: ['tree_nuts'] };
      const severe = { ...base, allergyCategoryIds: ['tree_nuts'], severeAllergyCategoryIds: ['tree_nuts'] };
      const mild = { ...base, allergyCategoryIds: ['tree_nuts'], severeAllergyCategoryIds: [] };
      expect(verdict(severe, biscuit, 'ALLERGY_CATEGORY')).toBe('FAILED');
      expect(verdict(mild, biscuit, 'ALLERGY_CATEGORY')).toBe('WARNED');
    });

    it('treats traces as severe when the snapshot has no severity data (fail closed)', () => {
      const profile = { ...base, allergyCategoryIds: ['tree_nuts'] };
      expect(verdict(profile, { foodId: 'biscuit', categoryIds: [], mayContainCategoryIds: ['tree_nuts'] }, 'ALLERGY_CATEGORY')).toBe('FAILED');
    });

    it('traces only warn for diets, health rules and dislikes', () => {
      const profile: SafetyProfileSnapshot = {
        ...base, dislikedCategoryIds: ['dairy'], dietaryPreferences: ['VEGAN'],
        dietaryRules: [{ dietaryPreference: 'VEGAN', rule: { ruleType: 'AVOID', targetType: 'CATEGORY', categoryId: 'dairy' } }],
        healthConditions: [{ status: 'ACTIVE', rules: [{ ruleType: 'AVOID', targetType: 'CATEGORY', categoryId: 'dairy' }] }],
      };
      const chips = { foodId: 'chips', categoryIds: ['snacks'], mayContainCategoryIds: ['dairy'] };
      expect(verdict(profile, chips, 'DIETARY')).toBe('WARNED');
      expect(verdict(profile, chips, 'HEALTH_AVOID')).toBe('WARNED');
      expect(verdict(profile, chips, 'DISLIKE_CATEGORY')).toBe('WARNED');
    });
  });
});
