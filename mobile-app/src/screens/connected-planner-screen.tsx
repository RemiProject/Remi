import { catalogLabel } from '@/i18n/catalog-labels';
import { recipeName, recipeNameMatches } from '@/i18n/recipe-names';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { RecipeArt } from '@/components/recipe-card';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';
import { AppText, Button, Card, Chip, EmptyState, SearchField, SectionHeader, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { kitchenRequest, loadPlans, loadRecipes, shiftDay, todayKey, type MealPeriod } from '@/services/kitchen-api';
import { planMeal } from '@/services/plan-shopping';
import { ConnectedScreen, DataNotice, Feedback, useAction, useCopy, useKitchenData, useKitchenIdentity } from './connected-ui';
import { formatAmount } from '@/domain/plan-shopping';
import { nutritionCopy, plannedDayTotals } from '@/domain/nutrition';
import { useLanguage } from '@/providers/language-provider';

const periods: readonly MealPeriod[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
export function ConnectedPlannerScreen({ embedded = false }: { embedded?: boolean }) { const identity = useKitchenIdentity(); return <PlannerContent key={identity} embedded={embedded} />; }
function PlannerContent({ embedded }: { embedded: boolean }) {
  const { language } = useLanguage(); const rtl = language === 'ar'; const { colors } = useRemyTheme();
  const params = useLocalSearchParams<{ recipeId?: string; date?: string; servings?: string }>(); const copy = useCopy();
  const [selected, setSelected] = useState(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey());
  const [editing, setEditing] = useState(!!params.recipeId); const [recipeId, setRecipeId] = useState(params.recipeId ?? ''); const [period, setPeriod] = useState<MealPeriod>('DINNER'); const [servings, setServings] = useState(params.servings ?? '2'); const [query, setQuery] = useState('');
  const state = useKitchenData(async () => { const [plans, recipes] = await Promise.all([loadPlans(shiftDay(selected, -7), shiftDay(selected, 7)), loadRecipes()]); return { plans, recipes }; });
  const action = useAction(state.reload);
  const { reload } = state;
  useEffect(() => { void reload(); }, [selected, reload]);
  const chooseRecipe = async () => { setEditing(true); };
  const recipes = state.data?.recipes ?? [];
  // The catalogue has hundreds of recipes: show the chosen one plus a few search matches, so Save stays in reach.
  const needle = query.trim().toLocaleLowerCase();
  const picked = recipes.find(recipe => recipe.id === recipeId);
  const matches = recipes.filter(recipe => recipe.id !== recipeId && recipeNameMatches(recipe.name, needle, language)).slice(0, picked ? 5 : 6);
  const save = async () => {
    if (!recipeId || !/^\d{4}-\d{2}-\d{2}$/.test(selected) || !/^\d+(?:\.\d{1,3})?$/.test(servings) || Number(servings) <= 0) throw new Error(copy('Choose a recipe, valid date and positive servings.', 'اختر وصفة وتاريخًا صالحًا وعدد حصص موجبًا.'));
    await planMeal({ recipeId, date: selected, mealType: period, servings }); setEditing(false);
  };
  const meals = (state.data?.plans ?? []).flatMap(plan => plan.meals).filter(meal => meal.mealDate === selected);
  const n = nutritionCopy[language]; const num = (v: number) => v.toLocaleString(language);
  const totals = plannedDayTotals(meals, new Map(recipes.map(recipe => [recipe.id, recipe.nutrition])));
  return <ConnectedScreen title={copy('Your meal plan', 'خطة وجباتك')} back={!embedded}>
    {/* One navigation row: the days, then the chosen day with week arrows beside it. */}
    <View style={{ gap: spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>{Array.from({ length: 7 }, (_, index) => shiftDay(selected, index - 3)).map(date => <Chip key={date} label={new Date(`${date}T12:00:00`).toLocaleDateString(language, { weekday: 'short', day: 'numeric' })} selected={date === selected} onPress={() => setSelected(date)} />)}</ScrollView>
      <View style={[uiStyles.row, { gap: spacing.sm }]}>
        <AppText variant="heading" accessibilityRole="header" style={uiStyles.grow}>{new Date(`${selected}T12:00:00`).toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' })}</AppText>
        {selected !== todayKey() && <Button label={copy('Today', 'اليوم')} variant="text" onPress={() => setSelected(todayKey())} />}
        <RoundIcon label={copy('Previous week', 'الأسبوع السابق')} flip={rtl} onPress={() => setSelected(shiftDay(selected, -7))} />
        <RoundIcon label={copy('Next week', 'الأسبوع التالي')} flip={!rtl} onPress={() => setSelected(shiftDay(selected, 7))} />
      </View>
    </View>
    <DataNotice {...state} /><Feedback message={action.message} />
    {state.data && !meals.length && <EmptyState title={copy('A little room for something good.', 'مساحة لوجبة لذيذة.')} description={copy('Choose a recipe and make a plan for this day.', 'اختر وصفة وخطط لهذا اليوم.')} />}
    {meals.length > 0 && <Card style={{ padding: spacing.sm, gap: 0 }}>{meals.map((meal, index) => <View key={meal.id} style={{ borderTopWidth: index ? 1 : 0, borderColor: colors.divider }}>
      <Pressable accessibilityRole="button" accessibilityLabel={recipeName(meal.recipeName, language)} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: meal.recipeId } })}
        style={({ pressed }) => [uiStyles.row, { gap: spacing.md, padding: spacing.sm, borderRadius: radii.md, backgroundColor: pressed ? colors.pressedSurface : 'transparent' }]}>
        <RecipeArt id={meal.recipeId} name={meal.recipeName} width={64} height={64} radius={radii.md} />
        <View style={[uiStyles.grow, { gap: 2 }]}>
          <AppText variant="caption" muted>{({ BREAKFAST: copy('Breakfast', 'الإفطار'), LUNCH: copy('Lunch', 'الغداء'), DINNER: copy('Dinner', 'العشاء'), SNACK: copy('Snack', 'وجبة خفيفة') } as Record<string, string>)[meal.mealType] ?? copy('Meal', 'وجبة')} · {formatAmount(meal.servings)} {copy('servings', 'حصص')}</AppText>
          <AppText variant="label" numberOfLines={2}>{recipeName(meal.recipeName, language)}</AppText>
        </View>
        <Icon name="chevron" size={16} color={colors.textSubtle} rtl={rtl} />
      </Pressable>
      <View style={{ alignItems: 'flex-end', paddingBottom: spacing.xs }}><Button label={copy('Remove', 'إزالة')} variant="dangerText" disabled={action.busy} onPress={() => { void action.run(() => kitchenRequest('mutation RemoveMeal($id: ID!) { removePlannedMeal(id: $id) }', { id: meal.id }), copy('Meal removed from your plan.', 'أُزيلت الوجبة من الخطة.')); }} /></View>
    </View>)}</Card>}
    {meals.length > 0 && totals.missing < meals.length && <Card testID="planned-day-nutrition" style={{ gap: 6 }}>
      <AppText variant="label">{n.planned}</AppText>
      <AppText variant="heading">{num(totals.calories)}{totals.missing ? '+' : ''} {n.kcal}</AppText>
      <AppText variant="caption" muted>{n.protein} {num(totals.proteinG)} {n.g} · {n.carbs} {num(totals.carbsG)} {n.g} · {n.fat} {num(totals.fatG)} {n.g}</AppText>
      <AppText variant="caption" muted>{n.plannedNote}{totals.missing ? ` ${totals.missing === 1 ? n.plannedMissing(num(1)) : n.plannedMissingMany(num(totals.missing))}` : ''}</AppText>
    </Card>}
    <Button label={copy('Plan a meal', 'خطط لوجبة')} disabled={action.busy} onPress={() => { void action.run(chooseRecipe); }} />
    {editing && <Card><SectionHeader title={copy('Add to your plan', 'أضف إلى خطتك')} /><FormField label={copy('Date (YYYY-MM-DD)', 'التاريخ (YYYY-MM-DD)')} value={selected} onChangeText={setSelected} autoCorrect={false} /><View style={uiStyles.wrap}>{periods.map(value => <Chip key={value} label={language === 'ar' ? catalogLabel(value, language) : value.toLowerCase()} selected={period === value} onPress={() => setPeriod(value)} />)}</View>
      <SearchField value={query} onChangeText={setQuery} placeholder={copy('Search recipes', 'ابحث عن وصفة')} accessibilityLabel={copy('Search recipes', 'ابحث عن وصفة')} autoCorrect={false} />
      <View style={uiStyles.wrap}>{[...(picked ? [picked] : []), ...matches].map(recipe => <Chip key={recipe.id} label={recipeName(recipe.name, language)} selected={recipeId === recipe.id} onPress={() => setRecipeId(recipe.id)} />)}</View>
      {needle && !matches.length && <AppText variant="caption" muted>{copy('No recipes match.', 'لا توجد وصفات مطابقة.')}</AppText>}<FormField label={copy('Servings', 'الحصص')} value={servings} onChangeText={setServings} keyboardType="decimal-pad" /><Button label={copy('Save meal', 'حفظ الوجبة')} disabled={action.busy} onPress={() => { void action.run(save, copy('Meal planned.', 'حُفظت الوجبة.')); }} /><Button label={copy('Cancel', 'إلغاء')} variant="text" onPress={() => setEditing(false)} /></Card>}
  </ConnectedScreen>;
}

/** A 44pt round arrow button for moving a week at a time. */
function RoundIcon({ label, flip, onPress }: { label: string; flip: boolean; onPress: () => void }) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
    style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.pressedSurface : colors.surface, borderWidth: 1, borderColor: colors.border })}>
    <Icon name="back" size={18} color={colors.text} rtl={flip} />
  </Pressable>;
}
