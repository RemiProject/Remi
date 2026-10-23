import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, PageHeader, Screen, SectionHeader, uiStyles } from '@/components/ui/core';
import { Icon, type IconName } from '@/components/ui/icon';
import { calendarLocale, calendarWeekdays, monthGrid, monthStart, shiftMonth } from '@/utils/planner-layout';
import { FormField } from '@/components/ui/form-field';
import { FoodImage } from '@/components/food-image';
import { demoRecipes } from '@/data/kitchen-demo';
import { recipePhotos, recipeTitle } from '@/data/home-content';
import { isCalendarDate, localDateKey } from '@/domain/inventory';
import { mealPeriods, type MealPeriod, type PlannedMeal } from '@/domain/planner';
import { plannerMessages } from '@/i18n/planner';
import { usePlanner } from '@/providers/planner-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';

export default function PlannerScreen() {
  const planner = usePlanner();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = plannerMessages[language];
  const rtl = language === 'ar';
  const [selected, setSelected] = useState(localDateKey);
  const [modal, setModal] = useState<'add' | PlannedMeal | null>(null);
  const [date, setDate] = useState(selected);
  const [period, setPeriod] = useState<MealPeriod>('breakfast');
  const [recipeId, setRecipeId] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [feedback, setFeedback] = useState<'added' | 'removed' | null>(null);
  const [month, setMonth] = useState(() => monthStart(localDateKey()));
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [focusedRecipe, setFocusedRecipe] = useState<string | null>(null);
  const weeks = monthGrid(month, language);
  const weekdays = calendarWeekdays(language);
  const today = localDateKey();

  const datePart = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { calendar: 'gregory', ...options }).format(new Date(value + 'T12:00:00'));
  const periodIcons: Record<MealPeriod, IconName> = { breakfast: 'clock', lunch: 'recipe', dinner: 'recipe', snack: 'food' };
  const format = (value: string, short = false) => new Intl.DateTimeFormat(language, { calendar: 'gregory', ...(short ? { weekday: 'short', day: 'numeric' } as const : { dateStyle: 'full' } as const) }).format(new Date(`${value}T12:00:00`));
  const openAdd = (mealPeriod: MealPeriod = 'breakfast') => { Keyboard.dismiss(); setDate(selected); setPeriod(mealPeriod); setRecipeId(''); setInvalid(false); setModal('add'); };
  const close = () => { if (!guard.current) setModal(null); };
  const save = async () => {
    if (guard.current) return;
    if (!isCalendarDate(date) || !mealPeriods.includes(period) || !demoRecipes.some((recipe) => recipe.id === recipeId)) { setInvalid(true); return; }
    guard.current = true; setBusy(true); Keyboard.dismiss(); setFeedback(null);
    try { await planner.add(date, period, recipeId); setSelected(date); setMonth(monthStart(date)); setModal(null); setFeedback('added'); }
    catch { /* Store retains the prior plan; localized write feedback stays visible. */ }
    finally { guard.current = false; setBusy(false); }
  };
  const remove = async (meal: PlannedMeal) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setFeedback(null);
    try { await planner.remove(meal.id); setModal(null); setFeedback('removed'); }
    catch { /* Keep details open for retry. */ }
    finally { guard.current = false; setBusy(false); }
  };
  const recipeFor = (meal: PlannedMeal) => demoRecipes.find((recipe) => recipe.id === meal.recipeId);
  const visible = planner.meals.filter((meal) => meal.date === selected);
  const detail = modal && modal !== 'add' ? modal : null;
  const detailRecipe = detail ? recipeFor(detail) : undefined;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl} contentGap={spacing.lg}>
    <PageHeader title={t.title} action={<Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    <View style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      <View style={[uiStyles.row, { gap: spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.previousMonth} onPress={() => setMonth(shiftMonth(month, -1))} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" rtl={rtl} size={20} /></Pressable>
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>{new Intl.DateTimeFormat(calendarLocale(language), { calendar: 'gregory', month: 'long', year: 'numeric' }).format(new Date(month + 'T12:00:00'))}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t.nextMonth} onPress={() => setMonth(shiftMonth(month, 1))} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron" rtl={rtl} size={20} /></Pressable>
      </View>
      <View accessibilityLabel={t.calendar} style={{ direction: rtl ? 'rtl' : 'ltr', gap: spacing.xs }}>
        <View style={{ flexDirection: 'row' }}>{weekdays.map((weekday, index) => <View key={index} style={{ flex: 1, minWidth: 0, paddingVertical: spacing.sm }}><AppText variant="caption" accessibilityLabel={weekday.full} style={{ textAlign: 'center' }} muted>{weekday.label}</AppText></View>)}</View>
        {weeks.map((week, row) => <View key={row} style={{ flexDirection: 'row' }}>{week.map((cell, column) => <View key={cell.date ?? column} style={{ flex: 1, minWidth: 0 }}>
          {cell.date ? <Pressable accessibilityRole="button" accessibilityLabel={format(cell.date) + (cell.date === today ? ', ' + t.today : '')} accessibilityState={{ selected: cell.date === selected }} onFocus={() => setFocusedDay(cell.date)} onBlur={() => setFocusedDay(null)} onPress={() => { setSelected(cell.date!); setMonth(monthStart(cell.date!)); setFeedback(null); }}
            style={({ pressed }) => ({ minHeight: 44, paddingVertical: spacing.xs, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.sm, backgroundColor: cell.date === selected ? colors.primary : pressed ? colors.pressedSurface : 'transparent', borderWidth: focusedDay === cell.date ? 2 : 1, borderColor: focusedDay === cell.date ? colors.focusBorder : cell.date === today ? colors.primary : 'transparent' })}>
            <AppText variant="label" style={{ textAlign: 'center', color: cell.date === selected ? colors.onPrimary : cell.inMonth ? colors.text : colors.textSubtle }}>{datePart(cell.date, { day: 'numeric' })}</AppText>
            <View accessible={false} style={{ width: 4, height: 4, borderRadius: radii.pill, backgroundColor: cell.date === today ? cell.date === selected ? colors.onPrimary : colors.primary : 'transparent' }} />
          </Pressable> : <View style={{ minHeight: 44 }} />}
        </View>)}</View>)}
      </View>
    </View>
    <View style={[uiStyles.row, { flexWrap: 'wrap' }]}><View style={{ flex: 1 }}><AppText variant="heading" accessibilityRole="header">{format(selected)}</AppText></View><Button label={t.today} variant="text" onPress={() => { setSelected(localDateKey()); setMonth(monthStart(localDateKey())); }} />{planner.status === 'ready' && visible.length > 0 && <AppText variant="caption" muted>{visible.length.toLocaleString(language)} {t.meals}</AppText>}</View>
    {feedback && <AppText accessibilityLiveRegion="polite">{t[feedback]}</AppText>}
    {planner.status !== 'ready' ? <Card><AppText accessibilityLiveRegion="polite">{planner.status === 'error' ? t.readError : t.loading}</AppText>{planner.status === 'error' && <Button label={t.retry} onPress={() => { void planner.retry(); }} />}</Card> : <>
      {planner.writeError && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t.writeError}</AppText>}
      {!visible.length && <View style={{ gap: spacing.xs, paddingVertical: spacing.sm }}><AppText variant="caption" muted>{t.empty}</AppText></View>}
      {mealPeriods.map((mealPeriod) => {
        const meals = visible.filter((meal) => meal.period === mealPeriod);
        return <View key={mealPeriod} style={{ gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.divider }}>
          <View style={[uiStyles.row, { flexWrap: 'wrap' }]}><Icon name={periodIcons[mealPeriod]} size={20} /><AppText variant="heading" style={{ flex: 1 }}>{t[mealPeriod]}</AppText><AppText variant="caption" muted>{meals.length.toLocaleString(language)}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t.add + ': ' + t[mealPeriod]} onPress={() => openAdd(mealPeriod)} style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: pressed ? colors.pressedSurface : 'transparent' })}><Icon name="add" size={20} /></Pressable>
          </View>
          {!meals.length && <AppText variant="caption" muted style={{ paddingStart: spacing.xxl }}>{t.none}</AppText>}
          {meals.map((meal) => {
            const recipe = recipeFor(meal);
            return <View key={meal.id} style={{ paddingVertical: spacing.sm, gap: spacing.xs }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.details + ': ' + (recipe ? recipeTitle(recipe.id, language) : t.missing)} onPress={() => setModal(meal)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
                <View style={{ width: 96, borderRadius: radii.sm, overflow: 'hidden' }}><FoodImage uri={recipe ? recipePhotos[recipe.id] : undefined} height={88} label={t.photo} /></View>
                <View style={{ flex: 1, gap: spacing.xs }}><AppText variant="heading">{recipe ? recipeTitle(recipe.id, language) : t.missing}</AppText><AppText variant="caption" muted>{recipe ? recipe.minutes.toLocaleString(language) + ' ' + t.minutes : t.missingBody}</AppText></View><Icon name="chevron" rtl={rtl} size={16} />
              </Pressable>
              <View style={uiStyles.wrap}>{recipe && <Button label={t.open} variant="text" disabled={busy} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} />}<Button label={t.remove} variant="dangerText" disabled={busy} onPress={() => { void remove(meal); }} /></View>
            </View>;
          })}
        </View>;
      })}
      <Button label={t.add} icon="add" onPress={() => openAdd()} />
    </>}
  </Screen>
    <Modal visible={modal !== null} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><Screen rtl={rtl} contentGap={spacing.lg}>
        <PageHeader title={detail ? t.details : t.add} action={<Button label={t.close} variant="text" disabled={busy} onPress={close} />} />
        {planner.writeError && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t.writeError}</AppText>}
        {detail ? <>
          <AppText variant="heading">{format(detail.date)}</AppText><AppText>{t[detail.period]}</AppText>
          {detailRecipe ? <><FoodImage uri={recipePhotos[detailRecipe.id]} label={t.photo} /><AppText variant="title">{recipeTitle(detailRecipe.id, language)}</AppText><AppText variant="caption" muted>{t.sample}</AppText>
            <Button label={t.open} disabled={busy} onPress={() => { setModal(null); router.push({ pathname: '/recipes/[id]', params: { id: detailRecipe.id } }); }} /></> : <AppText muted>{t.missingBody}</AppText>}
          <Button label={busy ? t.saving : t.remove} variant="destructive" disabled={busy} onPress={() => { void remove(detail); }} />
        </> : <>
          <FormField label={t.date} value={date} onChangeText={(value) => { setDate(value); setInvalid(false); }} editable={!busy} inputDirection="ltr" placeholder="YYYY-MM-DD" autoCapitalize="none" autoCorrect={false} hint={t.dateHint} error={invalid && !isCalendarDate(date) ? t.invalid : undefined} />
          <SectionHeader title={t.period} /><View style={uiStyles.wrap}>{mealPeriods.map((value) => <Chip key={value} label={t[value]} selected={value === period} disabled={busy} onPress={() => setPeriod(value)} />)}</View>
          <SectionHeader title={t.recipe} /><AppText variant="caption" muted>{t.sample}</AppText>
          {demoRecipes.map((recipe) => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={recipeTitle(recipe.id, language)} accessibilityHint={recipeId === recipe.id ? t.selectedRecipe : t.choose} accessibilityState={{ selected: recipeId === recipe.id, disabled: busy }} disabled={busy} onFocus={() => setFocusedRecipe(recipe.id)} onBlur={() => setFocusedRecipe(null)} onPress={() => { setRecipeId(recipe.id); setInvalid(false); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: focusedRecipe === recipe.id ? 3 : 2, borderColor: focusedRecipe === recipe.id ? colors.focusBorder : recipeId === recipe.id ? colors.selectedBorder : colors.border, backgroundColor: busy ? colors.disabledSurface : pressed ? colors.pressedSurface : recipeId === recipe.id ? colors.selectedSurface : colors.surface })}>
            <View style={{ width: 72, borderRadius: radii.sm, overflow: 'hidden' }}><FoodImage uri={recipePhotos[recipe.id]} height={72} label={t.photo} /></View><View style={{ flex: 1 }}><AppText variant="heading">{recipeTitle(recipe.id, language)}</AppText><AppText variant="caption" muted>{recipe.minutes.toLocaleString(language)} {t.minutes}</AppText></View>{recipeId === recipe.id && <Icon name="check" size={20} />}
          </Pressable>)}
          <Button label={t.cancel} variant="text" disabled={busy} onPress={close} />
          {invalid && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t.invalid}</AppText>}
          <Button label={busy ? t.saving : t.save} disabled={busy || planner.status !== 'ready'} onPress={() => { void save(); }} />
        </>}
      </Screen></KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
