import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/core';
import { energySplit, nutritionComplete, nutritionCopy, nutritionLabels, percentOf, type RecipeNutrition } from '@/domain/nutrition';
import { kitchenRequest } from '@/services/kitchen-api';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';

export interface NutritionGoal { calorieTarget: number | null; proteinTargetG: number | null }
let cachedGoal: NutritionGoal | null | undefined;
/** The signed-in user's calorie and protein targets, fetched once per app session. Null when unset or unavailable. */
export function useNutritionGoal(enabled = true) {
  const [goal, setGoal] = useState<NutritionGoal | null>(cachedGoal ?? null);
  useEffect(() => {
    if (!enabled || cachedGoal !== undefined) return;
    let live = true;
    kitchenRequest<{ myProfile: { goal: NutritionGoal | null } }>('query NutritionGoal { myProfile { goal { calorieTarget proteinTargetG } } }', {}, false)
      .then(data => { cachedGoal = data.myProfile.goal; if (live) setGoal(cachedGoal); })
      .catch(() => { /* No goal shown; the panel works without it. */ });
    return () => { live = false; };
  }, [enabled]);
  return goal;
}
/** Call after the goal changes so the next panel refetches it. */
export const forgetNutritionGoal = () => { cachedGoal = undefined; };

export function NutritionPanel({ nutrition, language, goal }: { nutrition: RecipeNutrition | null | undefined; language: 'en' | 'ar'; goal?: NutritionGoal | null }) {
  const { colors } = useRemyTheme();
  const t = nutritionCopy[language]; const rtl = language === 'ar'; const dir = rtl ? 'rtl' : 'ltr';
  const num = (value: number, digits = 0) => value.toLocaleString(language, { maximumFractionDigits: digits });
  if (!nutrition) return <View style={{ gap: spacing.sm }}>
    <AppText variant="heading" accessibilityRole="header">{t.title}</AppText>
    <AppText muted dir={dir}>{t.unknown}</AppText>
  </View>;

  const { countedIngredients, totalIngredients } = nutrition;
  const complete = nutritionComplete(nutrition);
  const split = energySplit(nutrition);
  const labels = nutritionLabels(nutrition);
  const goalPct = percentOf(nutrition.calories, goal?.calorieTarget);
  const lower = (key: string) => !complete || nutrition.incompleteNutrients.includes(key);
  const macros = [
    { key: 'protein', label: t.protein, grams: nutrition.proteinG, pct: split.protein, color: colors.primary },
    { key: 'carbs', label: t.carbs, grams: nutrition.carbsG, pct: split.carbs, color: colors.accent },
    { key: 'fat', label: t.fat, grams: nutrition.fatG, pct: split.fat, color: colors.hero },
  ];
  const rows = [
    { label: t.fibre, value: `${lower('FIBER') ? `${t.atLeast} ` : ''}${num(nutrition.fiberG, 1)} ${t.g}` },
    { label: t.sugar, value: `${lower('SUGAR') ? `${t.atLeast} ` : ''}${num(nutrition.sugarG, 1)} ${t.g}` },
    { label: t.sodium, value: `${complete ? '' : `${t.atLeast} `}${num(nutrition.sodiumMg)} ${t.mg}` },
  ];

  return <View style={{ gap: spacing.md, direction: dir }} testID="nutrition-panel">
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
      <AppText variant="heading" accessibilityRole="header">{t.title}</AppText>
      <AppText variant="caption" muted>{t.perServing}</AppText>
    </View>

    <View accessible accessibilityLabel={`${num(nutrition.calories)}${complete ? '' : '+'} ${t.kcal}${goalPct !== null ? `. ${t.ofGoal(num(goalPct), num(goal!.calorieTarget!))}` : ''}`} style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <AppText variant="title" style={{ fontSize: 40, lineHeight: 46 }}>{num(nutrition.calories)}{complete ? '' : '+'}</AppText>
        <AppText variant="label" muted>{t.kcal}</AppText>
      </View>
      {goalPct !== null && <AppText variant="caption" dir={dir} style={{ color: colors.accentText }}>{t.ofGoal(num(goalPct), num(goal!.calorieTarget!))}</AppText>}
    </View>

    <View accessible={false} style={{ flexDirection: 'row', height: 8, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: colors.divider }}>
      {macros.map(m => m.pct > 0 && <View key={m.key} style={{ flex: m.pct, backgroundColor: m.color }} />)}
    </View>
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {macros.map(m => <View key={m.key} accessible accessibilityLabel={`${m.label} ${num(m.grams, 1)} ${t.g}, ${num(m.pct)}% ${t.energy}`}
        style={{ flex: 1, padding: spacing.md, gap: 4, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color, borderWidth: m.key === 'fat' ? 1 : 0, borderColor: colors.text }} />
          <AppText variant="caption" muted numberOfLines={1}>{m.label}</AppText>
        </View>
        <AppText variant="heading" style={{ fontSize: 22, lineHeight: 28 }}>{num(m.grams, 1)}<AppText variant="caption" muted> {t.g}</AppText></AppText>
        <AppText variant="caption" muted numberOfLines={1}>{num(m.pct)}% {t.energy}</AppText>
      </View>)}
    </View>

    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {rows.map((row, index) => <View key={row.label} accessible accessibilityLabel={`${row.label}: ${row.value}`}
        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.divider }}>
        <AppText>{row.label}</AppText><AppText variant="label">{row.value}</AppText>
      </View>)}
    </View>

    {labels.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {labels.map(label => <View key={label} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.accentSoft }}>
        <AppText variant="caption" style={{ color: colors.accentText }}>{t.labels[label]}</AppText>
      </View>)}
    </View>}

    <AppText variant="caption" muted dir={dir}>
      {complete ? t.complete : t.partial(num(countedIngredients), num(totalIngredients))} {t.source}
    </AppText>
  </View>;
}
