import { recipeName } from '@/i18n/recipe-names';
import { Brand } from '@/components/brand';
import { useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Chip, Screen, uiStyles } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { recipeImage } from '@/components/recipe-card';
import { defaultAnswers, diets, goals, MAX_GOALS, MAX_HOUSEHOLD, MAX_RECIPES, toggleOption, type OnboardingAnswers } from '@/domain/onboarding';
import { onboardingMessages } from '@/i18n/onboarding';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { useLanguage } from '@/providers/language-provider';
import { useOnboarding } from '@/providers/onboarding-provider';
import { kitchenRequest, loadRecipes, shiftDay, todayKey } from '@/services/kitchen-api';
import { addPlannedMealsToShopping, planMeal } from '@/services/plan-shopping';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';
import { useKitchenData } from './connected-ui';

const QUESTIONS = 4; // household, diet, goals, recipes; welcome and done are not counted
const fill = (text: string, n: number, total = 0) => text.replace('{n}', String(n)).replace('{total}', String(total));

export default function OnboardingScreen() {
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = onboardingMessages[language];
  const rtl = language === 'ar';
  const onboarding = useOnboarding();
  const kitchen = useBackendKitchen();
  const catalogue = useKitchenData(loadRecipes);
  // Recipes with cookbook photography first, so the picker is visual; at most 8 to keep the step short.
  const choices = [...(catalogue.data ?? [])].sort((a, b) => Number(!recipeImage(a.name, a.id)) - Number(!recipeImage(b.name, b.id))).slice(0, 8);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultAnswers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState({ meals: 0, items: 0 });
  const guard = useRef(false);
  const done = useRef({ diets: false, planned: 0 }); // steps already written, so a retry never repeats them
  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => setAnswers((previous) => ({ ...previous, [key]: value }));

  const run = async (operation: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(false);
    try { await operation(); } catch { setError(true); } finally { guard.current = false; setBusy(false); }
  };
  const skip = () => run(async () => { await onboarding.complete(answers, true); router.replace('/'); });
  const finish = () => run(async () => {
    if (answers.diets.length && !done.current.diets) {
      // Merge with what the profile already has, so a returning user on a new device keeps earlier preferences.
      const existing = (await kitchenRequest<{ myProfile: { dietaryPreferences: string[] } }>('{ myProfile { dietaryPreferences } }', {}, false)).myProfile.dietaryPreferences;
      await kitchenRequest('mutation Prefs($input: SetDietaryPreferencesInputType!) { setDietaryPreferences(input: $input) { dietaryPreferences } }', { input: { preferences: [...new Set([...existing, ...answers.diets])] } }, false);
      done.current.diets = true;
    }
    const today = todayKey();
    for (; done.current.planned < answers.recipeIds.length; done.current.planned++) {
      await planMeal({ recipeId: answers.recipeIds[done.current.planned], date: shiftDay(today, done.current.planned), mealType: 'DINNER', servings: String(answers.householdSize) });
    }
    const shopping = await addPlannedMealsToShopping(kitchen.status === 'ready' ? kitchen.items.map((item) => ({ foodId: item.foodId, quantity: item.quantity, unit: item.backendUnit })) : [], today);
    await onboarding.complete(answers, false);
    setResult({ meals: answers.recipeIds.length, items: shopping.added.length }); setStep(5);
  });

  const steps: { title: string; body: string; content?: ReactNode; cta: string; onNext: () => void; disabled?: boolean }[] = [
    { title: t.welcomeTitle, body: t.welcomeBody, cta: t.start, onNext: () => setStep(1),
      content: <View style={{ gap: spacing.md }}><View style={{ height: 240, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hero }}><Brand kind="mascot" height={190} /></View><AppText variant="caption" muted>{t.welcomeTime}</AppText></View> },
    { title: t.householdTitle, body: t.householdBody, cta: t.next, onNext: () => setStep(2),
      content: <View style={uiStyles.wrap}>{Array.from({ length: MAX_HOUSEHOLD }, (_, index) => index + 1).map((size) =>
        <Chip key={size} label={`${size.toLocaleString(language)}${size === MAX_HOUSEHOLD ? '+' : ''} ${size === 1 ? t.person : t.people}`} selected={answers.householdSize === size} onPress={() => set('householdSize', size)} />)}</View> },
    { title: t.dietTitle, body: t.dietBody, cta: t.next, onNext: () => setStep(3),
      content: <View style={{ gap: spacing.sm }}>{diets.map((diet) => <Option key={diet} label={t[diet]} selected={answers.diets.includes(diet)} onPress={() => set('diets', toggleOption(answers.diets, diet))} />)}</View> },
    { title: t.goalsTitle, body: t.goalsBody, cta: t.next, onNext: () => setStep(4),
      content: <View style={{ gap: spacing.sm }}>{goals.map((goal) => { const selected = answers.goals.includes(goal);
        return <Option key={goal} label={t[goal]} selected={selected} disabled={!selected && answers.goals.length >= MAX_GOALS} onPress={() => set('goals', toggleOption(answers.goals, goal, MAX_GOALS))} />; })}</View> },
    { title: t.recipesTitle, body: t.recipesBody, cta: busy ? t.saving : t.next, onNext: () => { void finish(); }, disabled: !answers.recipeIds.length,
      content: <View style={{ gap: spacing.md }}>
        {catalogue.loading && !choices.length && <AppText muted accessibilityLiveRegion="polite">{t.recipesLoading}</AppText>}
        {catalogue.error && <View style={{ gap: spacing.sm }}><AppText accessibilityRole="alert">{catalogue.error}</AppText><Button label={t.retry} variant="secondary" onPress={() => { void catalogue.reload(); }} /></View>}
        {choices.map((recipe) => { const selected = answers.recipeIds.includes(recipe.id);
          return <RecipeOption key={recipe.id} title={recipeName(recipe.name, language)} minutes={`${((recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0)).toLocaleString(language)} ${t.minutes}`} image={recipeImage(recipe.name, recipe.id)} selectedLabel={t.selected}
            selected={selected} disabled={!selected && answers.recipeIds.length >= MAX_RECIPES} onPress={() => set('recipeIds', toggleOption(answers.recipeIds, recipe.id, MAX_RECIPES))} />; })}
        {!answers.recipeIds.length && !!choices.length && <AppText variant="caption" muted>{t.recipesNeeded}</AppText>}
      </View> },
    { title: t.doneTitle, body: t.doneBody, cta: t.openList, onNext: () => { router.replace('/'); router.push({ pathname: '/feature', params: { feature: 'shopping' } }); },
      content: <View style={{ gap: spacing.sm }}>
        <Summary icon="calendar" text={result.meals === 1 ? t.mealPlanned : fill(t.mealsPlanned, result.meals)} />
        <Summary icon="shopping" text={!result.items ? t.nothingAdded : result.items === 1 ? t.itemAdded : fill(t.itemsAdded, result.items)} />
      </View> },
  ];
  const current = steps[step];
  const last = step === steps.length - 1;
  const question = step >= 1 && step <= QUESTIONS;

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
    <Screen rtl={rtl} contentGap={spacing.xl} footer={<View style={{ gap: spacing.sm }}>
      {error && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t.error}</AppText>}
      <Button label={current.cta} disabled={busy || current.disabled} onPress={current.onNext} />
      {last && <Button label={t.goHome} variant="text" onPress={() => router.replace('/')} />}
    </View>}>
      <View style={[uiStyles.row, { minHeight: 48 }]}>
        <View style={{ minWidth: 88 }}>{question && <Button label={t.back} icon="back" rtl={rtl} variant="text" disabled={busy} onPress={() => setStep(step - 1)} />}</View>
        <View {...(question ? { accessibilityRole: 'progressbar' as const, accessibilityLabel: fill(t.progress, step, QUESTIONS), accessibilityValue: { min: 0, max: QUESTIONS, now: step } } : { importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true })}
          style={[uiStyles.row, uiStyles.grow, { gap: spacing.xs, opacity: question ? 1 : 0 }]}>
          {Array.from({ length: QUESTIONS }, (_, index) => <View key={index} style={{ flex: 1, height: 4, borderRadius: radii.pill, backgroundColor: index < step ? colors.primary : colors.border }} />)}
        </View>
        <View style={{ minWidth: 88, alignItems: 'flex-end' }}>{!last && <Button label={t.skip} variant="text" disabled={busy} onPress={() => { void skip(); }} />}</View>
      </View>
      <View style={{ gap: spacing.sm }}><AppText variant="title" accessibilityRole="header">{current.title}</AppText><AppText muted>{current.body}</AppText></View>
      {current.content}
    </Screen>
  </SafeAreaView>;
}

function Summary({ icon, text }: { icon: 'calendar' | 'shopping'; text: string }) {
  const { colors } = useRemyTheme();
  return <View style={[uiStyles.row, { padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.successSurface }]}><Icon name={icon} size={20} color={colors.successText} /><AppText style={[uiStyles.grow, { color: colors.successText }]}>{text}</AppText></View>;
}

function Option({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [uiStyles.row, { minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 2,
      borderColor: selected ? colors.selectedBorder : colors.border, backgroundColor: pressed ? colors.pressedSurface : selected ? colors.selectedSurface : colors.surface }]}>
    <AppText variant="label" style={[uiStyles.grow, { color: disabled ? colors.disabledText : colors.text }]}>{label}</AppText>
    <View style={{ width: 24, height: 24, borderRadius: radii.sm, borderWidth: 2, borderColor: disabled ? colors.disabledText : colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.primary : 'transparent' }}>
      {selected && <Icon name="check" size={14} color={colors.onPrimary} />}
    </View>
  </Pressable>;
}

function RecipeOption({ title, minutes, image, selected, disabled, selectedLabel, onPress }: { title: string; minutes: string; image?: number; selected: boolean; disabled: boolean; selectedLabel: string; onPress: () => void }) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${title}, ${minutes}`} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ borderRadius: radii.lg, overflow: 'hidden', borderWidth: 2, opacity: disabled ? 0.6 : 1, borderColor: selected ? colors.selectedBorder : colors.border, backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
    {image !== undefined && <Image source={image} contentFit="cover" accessible={false} style={{ width: '100%', height: 150 }} />}
    <View style={[uiStyles.row, { padding: spacing.lg }]}>
      <View style={[uiStyles.grow, { gap: spacing.xs }]}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{minutes}</AppText></View>
      {selected ? <View style={[uiStyles.row, { gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.primary }]}><Icon name="check" size={14} color={colors.onPrimary} /><AppText variant="caption" style={{ color: colors.onPrimary }}>{selectedLabel}</AppText></View>
        : <View style={{ width: 24, height: 24, borderRadius: radii.sm, borderWidth: 2, borderColor: colors.primary }} />}
    </View>
  </Pressable>;
}
