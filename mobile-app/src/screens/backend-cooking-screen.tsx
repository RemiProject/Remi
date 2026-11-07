import { Brand } from '@/components/brand';
import { scaleMealAmount } from '@/domain/cooked-it';
import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';
import { AppText, Button, Card, EmptyState, PageHeader, Screen, uiStyles } from '@/components/ui/core';
import { StepTimer } from '@/components/step-timer';
import { useBackendCookingSession, useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { cookedItMessages } from '@/i18n/cooked-it';
import { cookingMessages } from '@/i18n/cooking';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeFoodName, recipeIngredientStatus, recipeNumber, recipeQuantity } from '@/utils/backend-recipe-view';
import { advanceCooking, selectCookingStep } from '@/utils/cooking-session';
import { radii, spacing } from '@/theme/tokens';

// Mob-style cook mode: one step per page, segmented progress, ingredients one tap away, screen kept on.
export function BackendCookingScreen() {
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();
  const state = useBackendRecipes(), { owner, ensureDetail } = state;
  const { session, update } = useBackendCookingSession(id);
  const { language } = useLanguage(), { colors } = useRemyTheme();
  const { width } = useWindowDimensions(); const reduced = useReducedMotion();
  const pager = useRef<ScrollViewInstance>(null); const [view, setView] = useState<'method' | 'ingredients'>('method');
  useKeepAwake();
  const t = cookingMessages[language], r = backendRecipeMessages[language];
  const rtl = language === 'ar', dir = rtl ? 'rtl' : 'ltr';
  const detail = state.detail?.id === id ? state.detail : null;
  const status = state.status === 'signed-out' ? 'signed-out' : detail?.status ?? (state.status === 'error' ? 'error' : 'loading');
  const recipe = status === 'ready' ? detail?.recipe : undefined;
  const count = servings && /^\d+$/.test(servings) && Number(servings) >= 1 && Number(servings) <= 20 ? servings : String(recipe?.servings ?? 1);
  const steps = [...(recipe?.steps ?? [])].sort((a, b) => a.stepNumber - b.stepNumber);
  const current = Math.min(session.current, Math.max(0, steps.length - 1));
  // Keep the pager on the session's step (buttons, progress taps, restored sessions). Declared before the load effect.
  useEffect(() => { pager.current?.scrollTo({ x: current * width, animated: !reduced }); }, [current, width, reduced, view]);
  useEffect(() => { if (owner) void ensureDetail(id); }, [owner, ensureDetail, id]);
  const review = () => router.replace({ pathname: '/recipes/[id]', params: { id } });
  const browse = () => router.replace({ pathname: '/feature', params: { feature: 'recipes' } });
  const retry = () => { if (!owner) void state.refresh(); else void state.loadDetail(id); };
  const go = (index: number) => update(session => selectCookingStep(session, index, steps.length));
  const duration = (minutes: number) => `${recipeNumber(minutes, language)} ${r.minutes}`;
  const exit = <Button label={t.exit} variant="text" icon="back" rtl={rtl} onPress={review} />;

  if (!recipe || !steps.length) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl} contentGap={spacing.lg}>
    <PageHeader title={t.title} back={exit} />
    {status === 'signed-out' ? <EmptyState title={r.cookingSignIn} description={r.signInBody} action={r.signIn} onPress={() => router.push('/login')} />
      : status === 'error' ? <Card><AppText accessibilityRole="alert" dir={dir}>{r.error}</AppText><Button label={r.retry} onPress={retry} /></Card>
      : !recipe ? <AppText dir={dir} accessibilityLiveRegion="polite">{r.loading}</AppText>
      : <EmptyState title={t.missing} description={t.missingBody} action={t.choose} onPress={browse} />}
  </Screen></SafeAreaView>;

  if (session.finished) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flex: 1, padding: 20, gap: spacing.lg, justifyContent: 'center', direction: dir }}>
    <View style={{ padding: spacing.xl, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.hero }}>
      <View style={[uiStyles.row, { alignItems: 'flex-end' }]}><AppText variant="title" accessibilityRole="header" style={[uiStyles.grow, { color: colors.onHero }]}>{r.cookingDone}</AppText><Brand kind="mascot" height={96} /></View>
      <AppText variant="label" dir="ltr" style={{ color: colors.onHero }}>{recipe.name}</AppText>
      <AppText dir={dir} style={{ color: colors.onHero }}>{t.summary}</AppText>
    </View>
    <AppText dir={dir}>{cookedItMessages[language].prompt}</AppText>
    <Button label={cookedItMessages[language].yes} onPress={() => router.push({ pathname: '/cooked-it', params: { id, ...(servings ? { servings } : {}) } })} />
    <Button label={cookedItMessages[language].notNow} variant="text" onPress={review} />
  </View></SafeAreaView>;

  const last = current === steps.length - 1;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ flex: 1, direction: dir }}>
    <View style={{ paddingHorizontal: 20, paddingTop: spacing.sm, gap: spacing.md }}>
      <View style={uiStyles.row}>{exit}<AppText variant="caption" muted numberOfLines={1} dir="ltr" style={[uiStyles.grow, { textAlign: rtl ? 'left' : 'right' }]}>{recipe.name} · {count} {rtl ? 'حصص' : 'servings'}</AppText></View>
      <View accessibilityRole="progressbar" accessibilityLabel={t.progress} accessibilityValue={{ min: 0, max: steps.length, now: session.completed.length }} style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((step, index) => <Pressable key={step.id} testID="cook-progress-segment" accessibilityRole="button" accessibilityLabel={`${t.step} ${recipeNumber(index + 1, language)} · ${session.completed.includes(index) ? t.completed : t.remaining}`}
          accessibilityState={{ selected: index === current }} hitSlop={{ top: 14, bottom: 14 }} onPress={() => { setView('method'); go(index); }}
          style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: index === current ? colors.primary : session.completed.includes(index) ? colors.accent : colors.divider }} />)}
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }}>
        {(['method', 'ingredients'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: view === key }} onPress={() => setView(key)}
          style={{ flex: 1, minHeight: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: view === key ? colors.surface : 'transparent' }}>
          <AppText variant="label" style={{ color: view === key ? colors.text : colors.textSecondary }}>{key === 'method' ? (rtl ? 'الطريقة' : 'Method') : r.ingredients}</AppText></Pressable>)}
      </View>
    </View>
    {view === 'method' ? <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1, direction: 'ltr' }}
      onMomentumScrollEnd={event => { const index = Math.round(event.nativeEvent.contentOffset.x / width); if (index !== current) go(index); }}>
      {steps.map((step, index) => <ScrollView key={step.id} style={{ width }} contentContainerStyle={{ padding: 24, paddingTop: spacing.xxl, gap: spacing.lg, direction: dir }}>
        <AppText variant="label" dir={dir} style={{ color: colors.accentText }}>{t.step} {recipeNumber(index + 1, language)} {t.of} {recipeNumber(steps.length, language)}</AppText>
        <AppText variant="heading" dir="ltr" accessibilityLiveRegion={index === current ? 'polite' : 'none'} style={{ fontSize: 27, lineHeight: 36 }}>{step.instruction}</AppText>
        {step.durationMin !== null && <><AppText muted dir={dir}>{duration(step.durationMin)}</AppText><StepTimer minutes={step.durationMin} /></>}
      </ScrollView>)}
    </ScrollView> : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: spacing.md }}>
      {detail?.matchingLoading && <AppText dir={dir}>{r.matchingLoading}</AppText>}
      {detail?.matchingError && <><AppText dir={dir}>{r.matchingError}</AppText><Button label={r.retry} onPress={retry} /></>}
      {!detail?.matchingLoading && !detail?.matchingError && !detail?.suggestion && <AppText muted dir={dir}>{r.matchingUnavailable}</AppText>}
      <Card style={{ gap: 0, paddingVertical: 4 }}>{recipe.ingredients.map((ingredient, index) => {
        const status = recipeIngredientStatus(ingredient, detail?.suggestion, language);
        return <View key={ingredient.id} style={{ paddingVertical: 12, gap: 2, borderTopWidth: index ? 1 : 0, borderColor: colors.divider }}>
          <View style={uiStyles.row}><AppText variant="label" dir={dir} style={uiStyles.grow}>{recipeFoodName(ingredient, language)}</AppText>
            <AppText dir={dir} style={{ color: colors.textSecondary }}>{recipeQuantity(scaleMealAmount(ingredient.quantity, String(recipe.servings), count), ingredient.unit, language)}</AppText></View>
          {status && <AppText variant="caption" muted dir={dir}>{status}</AppText>}
        </View>;
      })}</Card>
    </ScrollView>}
    <View style={[uiStyles.row, { paddingHorizontal: 20, paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.divider }]}>
      <Button label={t.previous} variant="secondary" disabled={current === 0} onPress={() => { setView('method'); go(current - 1); }} />
      <View style={uiStyles.grow}><Button label={last ? t.finish : t.next} onPress={() => { setView('method'); update(session => advanceCooking(session, steps.length)); }} /></View>
    </View>
  </View></SafeAreaView>;
}
