export const SAFETY_FILTERS = [
  'ALLERGY_FOOD', 'ALLERGY_CATEGORY', 'HEALTH_AVOID', 'HEALTH_LIMIT',
  'HEALTH_PREFER', 'DISLIKE_FOOD', 'DISLIKE_CATEGORY', 'DIETARY',
] as const;

export type SafetyFilter = typeof SAFETY_FILTERS[number];
export type SafetyResult = 'PASSED' | 'WARNED' | 'FAILED';
export type RuleType = 'AVOID' | 'LIMIT' | 'PREFER';
export type RuleTarget = 'FOOD' | 'CATEGORY' | 'NUTRIENT';

export interface SafetyIngredient {
  foodId: string;
  categoryIds: string[];
  nutrientsPer100g?: Partial<Record<'CALORIES' | 'PROTEIN' | 'CARBS' | 'FAT' | 'FIBER' | 'SUGAR' | 'SODIUM', number>>;
}

export interface SafetyRule {
  ruleType: RuleType;
  targetType: RuleTarget;
  foodId?: string;
  categoryId?: string;
  nutrient?: keyof NonNullable<SafetyIngredient['nutrientsPer100g']>;
  maxPer100g?: number;
}

export interface SafetyProfileSnapshot {
  allergyFoodIds: string[];
  allergyCategoryIds: string[];
  dislikedFoodIds: string[];
  dislikedCategoryIds: string[];
  dietaryPreferences: string[];
  healthConditions: Array<{ status: 'ACTIVE' | 'CONTROLLED' | 'REMISSION' | 'RESOLVED'; rules: SafetyRule[] }>;
  dietaryRules: Array<{ dietaryPreference: string; rule: SafetyRule }>;
}

export interface SafetyFilterVerdict {
  filterType: SafetyFilter;
  result: SafetyResult;
  blockedFoodIds: string[];
}

/** Pure safety gate. Any allergy is a hard block; dislike and configured limits only warn. */
export class SafetyEvaluator {
  evaluate(profile: SafetyProfileSnapshot, ingredients: SafetyIngredient[]): SafetyFilterVerdict[] {
    const verdicts = new Map<SafetyFilter, { failed: Set<string>; warned: Set<string> }>();
    for (const filter of SAFETY_FILTERS) verdicts.set(filter, { failed: new Set(), warned: new Set() });

    for (const ingredient of ingredients) {
      if (profile.allergyFoodIds.includes(ingredient.foodId)) verdicts.get('ALLERGY_FOOD')!.failed.add(ingredient.foodId);
      if (ingredient.categoryIds.some((id) => profile.allergyCategoryIds.includes(id))) verdicts.get('ALLERGY_CATEGORY')!.failed.add(ingredient.foodId);
      if (profile.dislikedFoodIds.includes(ingredient.foodId)) verdicts.get('DISLIKE_FOOD')!.warned.add(ingredient.foodId);
      if (ingredient.categoryIds.some((id) => profile.dislikedCategoryIds.includes(id))) verdicts.get('DISLIKE_CATEGORY')!.warned.add(ingredient.foodId);

      for (const condition of profile.healthConditions) {
        if (condition.status === 'RESOLVED') continue;
        for (const rule of condition.rules) {
          const filter = rule.ruleType === 'AVOID' ? 'HEALTH_AVOID' : rule.ruleType === 'LIMIT' ? 'HEALTH_LIMIT' : 'HEALTH_PREFER';
          const matches = matchesRule(rule, ingredient);
          if (!matches) continue;
          const failed = rule.ruleType === 'AVOID';
          (failed ? verdicts.get(filter)!.failed : verdicts.get(filter)!.warned).add(ingredient.foodId);
        }
      }

      for (const { dietaryPreference, rule } of profile.dietaryRules) {
        if (!profile.dietaryPreferences.includes(dietaryPreference) || !matchesRule(rule, ingredient)) continue;
        (rule.ruleType === 'AVOID' ? verdicts.get('DIETARY')!.failed : verdicts.get('DIETARY')!.warned).add(ingredient.foodId);
      }
    }

    return SAFETY_FILTERS.map((filterType) => {
      const state = verdicts.get(filterType)!;
      const result: SafetyResult = state.failed.size ? 'FAILED' : state.warned.size ? 'WARNED' : 'PASSED';
      return { filterType, result, blockedFoodIds: [...state.failed].sort() };
    });
  }
}

function matchesRule(rule: SafetyRule, ingredient: SafetyIngredient): boolean {
  if (rule.targetType === 'FOOD') return rule.foodId === ingredient.foodId;
  if (rule.targetType === 'CATEGORY') return !!rule.categoryId && ingredient.categoryIds.includes(rule.categoryId);
  if (rule.targetType === 'NUTRIENT' && rule.nutrient && rule.maxPer100g !== undefined) {
    const amount = ingredient.nutrientsPer100g?.[rule.nutrient];
    return amount !== undefined && amount > rule.maxPer100g;
  }
  return false;
}
