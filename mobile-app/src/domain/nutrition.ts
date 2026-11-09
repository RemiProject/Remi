/** Estimated nutrition per serving, as served by the API (`RecipeNutritionType`). */
export interface RecipeNutrition {
  calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number;
  countedIngredients: number; totalIngredients: number; incompleteNutrients: string[];
}

export const nutritionFields = 'nutrition { calories proteinG carbsG fatG fiberG sugarG sodiumMg countedIngredients totalIngredients incompleteNutrients }';

/** Every required ingredient was counted, so the figures are estimates rather than lower bounds. */
export const nutritionComplete = (n: RecipeNutrition | null | undefined): n is RecipeNutrition =>
  !!n && n.countedIngredients === n.totalIngredients;

export type NutritionLabel = 'high-protein' | 'high-fibre' | 'low-calorie' | 'low-carb';
/** Per serving. High protein follows Mob's ">30 g"; the others are Remi's own thresholds, documented in docs/nutrition.md. */
export const LABEL_RULES: Record<NutritionLabel, (n: RecipeNutrition) => boolean> = {
  'high-protein': n => n.proteinG >= 30,
  'high-fibre': n => n.fiberG >= 8 && !n.incompleteNutrients.includes('FIBER'),
  'low-calorie': n => n.calories <= 400,
  'low-carb': n => n.carbsG <= 20,
};
/** Labels only for complete data: a partial total could wrongly read as low calorie or low carb. */
export function nutritionLabels(n: RecipeNutrition | null | undefined): NutritionLabel[] {
  if (!nutritionComplete(n)) return [];
  return (Object.keys(LABEL_RULES) as NutritionLabel[]).filter(label => LABEL_RULES[label](n));
}
export const LIGHT_KCAL = 500;

/** Share of energy from protein, carbs and fat (Atwater 4/4/9), as whole percentages that add up to 100. */
export function energySplit(n: Pick<RecipeNutrition, 'proteinG' | 'carbsG' | 'fatG'>) {
  const kcal = { protein: n.proteinG * 4, carbs: n.carbsG * 4, fat: n.fatG * 9 };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round((kcal.protein / total) * 100), carbs = Math.round((kcal.carbs / total) * 100);
  return { protein, carbs, fat: Math.max(0, 100 - protein - carbs) };
}

export interface DayTotals { calories: number; proteinG: number; carbsG: number; fatG: number; meals: number; missing: number }
/** One serving of each planned meal: what one person eats that day. Meals whose recipe has no nutrition are counted as missing. */
export function plannedDayTotals(meals: readonly { recipeId: string }[], nutritionByRecipe: ReadonlyMap<string, RecipeNutrition | null | undefined>): DayTotals {
  const totals: DayTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: meals.length, missing: 0 };
  for (const meal of meals) {
    const n = nutritionByRecipe.get(meal.recipeId);
    if (!n) { totals.missing++; continue; }
    if (!nutritionComplete(n)) totals.missing++;
    totals.calories += n.calories; totals.proteinG += n.proteinG; totals.carbsG += n.carbsG; totals.fatG += n.fatG;
  }
  return { ...totals, proteinG: Math.round(totals.proteinG), carbsG: Math.round(totals.carbsG), fatG: Math.round(totals.fatG) };
}

/** Whole percentage of a target, or null when there is no target. */
export const percentOf = (value: number, target: number | null | undefined) => target && target > 0 ? Math.round((value / target) * 100) : null;

export const nutritionCopy = {
  en: {
    title: 'Nutrition', calories: 'Calories', perServing: 'per serving', kcal: 'kcal', g: 'g', mg: 'mg',
    protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre', sugar: 'Sugar', sodium: 'Sodium', energy: 'of energy',
    atLeast: 'at least', ofGoal: (pct: string, goal: string) => `${pct}% of your ${goal} kcal goal`,
    partial: (n: string, total: string) => `Based on ${n} of ${total} ingredients, so the real values are higher. No labels until every ingredient has data.`,
    complete: 'Estimated from every ingredient.',
    source: 'Raw-ingredient values from USDA FoodData Central. Cooking changes them a little. Not medical advice.',
    labels: { 'high-protein': 'High protein', 'high-fibre': 'High fibre', 'low-calorie': 'Low calorie', 'low-carb': 'Low carb' } as Record<NutritionLabel, string>,
    tabs: { protein: 'High protein', light: `Under ${LIGHT_KCAL} kcal` },
    planned: 'Planned for this day', plannedNote: 'One serving of each meal.', plannedMissing: (n: string) => `${n} meal without nutrition data is left out.`, plannedMissingMany: (n: string) => `${n} meals without full nutrition data are left out or partial.`,
    today: 'Today', last7: 'Last 7 days', logged: (n: string, count: number) => `${n} ${count === 1 ? 'meal' : 'meals'} logged`, noMeals: 'Nothing logged yet today. Tap “Cooked it” after a recipe, or log food below.',
    target: (v: string) => `Goal ${v}`, setGoal: 'Set a calorie and protein goal to see your progress.', avg: 'Daily average',
    unknown: 'No nutrition data for this recipe yet.',
  },
  ar: {
    title: 'القيم الغذائية', calories: 'السعرات', perServing: 'للحصة', kcal: 'سعرة', g: 'غ', mg: 'ملغ',
    protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون', fibre: 'ألياف', sugar: 'سكر', sodium: 'صوديوم', energy: 'من الطاقة',
    atLeast: 'على الأقل', ofGoal: (pct: string, goal: string) => `${pct}٪ من هدفك ${goal} سعرة`,
    partial: (n: string, total: string) => `محسوبة من ${n} من ${total} مكونات، لذا القيم الفعلية أعلى. لا تظهر الوسوم حتى تتوفر بيانات كل المكونات.`,
    complete: 'تقدير من كل المكونات.',
    source: 'قيم المكونات النيئة من قاعدة USDA FoodData Central. الطهي يغيّرها قليلًا. ليست نصيحة طبية.',
    labels: { 'high-protein': 'غني بالبروتين', 'high-fibre': 'غني بالألياف', 'low-calorie': 'قليل السعرات', 'low-carb': 'قليل الكربوهيدرات' } as Record<NutritionLabel, string>,
    tabs: { protein: 'غني بالبروتين', light: `أقل من ${LIGHT_KCAL.toLocaleString('ar')} سعرة` },
    planned: 'المخطط لهذا اليوم', plannedNote: 'حصة واحدة من كل وجبة.', plannedMissing: (n: string) => `${n} وجبة بلا بيانات غذائية غير محسوبة.`, plannedMissingMany: (n: string) => `${n} وجبات بلا بيانات غذائية كاملة غير محسوبة أو جزئية.`,
    today: 'اليوم', last7: 'آخر ٧ أيام', logged: (n: string, count: number) => `${n} ${count === 1 ? 'وجبة مسجلة' : 'وجبات مسجلة'}`, noMeals: 'لم تُسجل وجبات اليوم بعد. اضغط «طبختها» بعد الوصفة، أو سجّل طعامًا بالأسفل.',
    target: (v: string) => `الهدف ${v}`, setGoal: 'حدد هدفًا للسعرات والبروتين لترى تقدمك.', avg: 'المتوسط اليومي',
    unknown: 'لا توجد بيانات غذائية لهذه الوصفة بعد.',
  },
} as const;

/** "460 kcal", or "41+ kcal" when ingredients are missing data (the real value is higher). */
export function energyLabel(n: RecipeNutrition | null | undefined, language: 'en' | 'ar'): string | null {
  if (!n) return null;
  const value = `${n.calories.toLocaleString(language)}${nutritionComplete(n) ? '' : '+'}`;
  return `${value} ${nutritionCopy[language].kcal}`;
}
