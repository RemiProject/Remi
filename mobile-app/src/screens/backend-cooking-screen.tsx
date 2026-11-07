import { scaleMealAmount } from '@/domain/cooked-it';
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { useBackendCookingSession, useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { cookedItMessages } from '@/i18n/cooked-it';
import { cookingMessages } from '@/i18n/cooking';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeFoodName, recipeIngredientStatus, recipeNumber, recipeQuantity } from '@/utils/backend-recipe-view';
import { advanceCooking, selectCookingStep } from '@/utils/cooking-session';
import { radii, spacing } from '@/theme/tokens';

export function BackendCookingScreen() {
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();
  const state = useBackendRecipes(), { owner, ensureDetail } = state;
  const { session, update } = useBackendCookingSession(id);
  const { language } = useLanguage(), { colors } = useRemyTheme();
  const t = cookingMessages[language], r = backendRecipeMessages[language];
  const rtl = language === 'ar', dir = rtl ? 'rtl' : 'ltr';
  useEffect(() => { if (owner) void ensureDetail(id); }, [owner, ensureDetail, id]);
  const detail = state.detail?.id === id ? state.detail : null;
  const status = state.status === 'signed-out' ? 'signed-out' : detail?.status ?? (state.status === 'error' ? 'error' : 'loading');
  const recipe = status === 'ready' ? detail?.recipe : undefined;
  const count = servings && /^\d+$/.test(servings) && Number(servings) >= 1 && Number(servings) <= 20 ? servings : String(recipe?.servings ?? 1);
  const steps = [...(recipe?.steps ?? [])].sort((a, b) => a.stepNumber - b.stepNumber);
  const current = Math.min(session.current, Math.max(0, steps.length - 1));
  const review = () => router.replace({ pathname: '/recipes/[id]', params: { id } });
  const browse = () => router.replace({ pathname: '/feature', params: { feature: 'recipes' } });
  const retry = () => { if (!owner) void state.refresh(); else void state.loadDetail(id); };
  const duration = (minutes: number) => `${recipeNumber(minutes, language)} ${r.minutes}`;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl} contentGap={spacing.lg}>
    <PageHeader title={t.title} action={<Button label={t.exit} variant="text" icon="back" rtl={rtl} onPress={review} />} />
    {status === 'signed-out' ? <EmptyState title={r.cookingSignIn} description={r.signInBody} action={r.signIn} onPress={() => router.push('/login')} />
      : status === 'error' ? <Card><AppText accessibilityRole="alert" dir={dir}>{r.error}</AppText><Button label={r.retry} onPress={retry} /></Card>
      : !recipe ? <AppText dir={dir} accessibilityLiveRegion="polite">{r.loading}</AppText>
      : !steps.length ? <EmptyState title={t.missing} description={t.missingBody} action={t.choose} onPress={browse} />
      : <>
        <AppText variant="heading" dir="ltr">{recipe.name}</AppText><AppText dir={dir}>{count} {language === 'ar' ? 'حصص للتحضير' : 'servings prepared'}</AppText>
        {session.finished ? <>
          <PageHeader title={r.cookingDone} subtitle={t.summary} />
          <AppText dir={dir}>{cookedItMessages[language].prompt}</AppText>
          <Button label={cookedItMessages[language].yes} onPress={() => router.push({ pathname: '/cooked-it', params: { id, ...(servings ? { servings } : {}) } })} />
          <Button label={cookedItMessages[language].notNow} variant="text" onPress={review} />
        </> : <>

          <AppText dir={dir} accessibilityLiveRegion="polite" variant="label">{t.step} {recipeNumber(current + 1, language)} {t.of} {recipeNumber(steps.length, language)}</AppText>
          <View accessibilityRole="progressbar" accessibilityLabel={t.progress} accessibilityValue={{ min: 0, max: steps.length, now: session.completed.length }}
            style={{ height: 8, borderRadius: radii.md, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
            <View style={{ height: 8, width: `${session.completed.length / steps.length * 100}%`, backgroundColor: colors.primary }} />
          </View>
          <Card>
            <AppText variant="heading" accessibilityLiveRegion="polite" dir="ltr">{steps[current].instruction}</AppText>
            {steps[current].durationMin !== null && <AppText dir={dir}>{duration(steps[current].durationMin)}</AppText>}
          </Card>
          <Button label={current === steps.length - 1 ? t.finish : t.next} onPress={() => update(current => advanceCooking(current, steps.length))} />
          <Button label={t.previous} variant="secondary" disabled={current === 0} onPress={() => update(current => selectCookingStep(current, current.current - 1, steps.length))} />
          {current === 0 && <Card>
            <SectionHeader title={r.ingredients} />
            {detail?.matchingLoading && <AppText dir={dir}>{r.matchingLoading}</AppText>}
            {detail?.matchingError && <><AppText dir={dir}>{r.matchingError}</AppText><Button label={r.retry} onPress={retry} /></>}
            {!detail?.matchingLoading && !detail?.matchingError && !detail?.suggestion && <AppText muted dir={dir}>{r.matchingUnavailable}</AppText>}
            {recipe.ingredients.map(ingredient => {
              const status = recipeIngredientStatus(ingredient, detail?.suggestion, language);
              return <View key={ingredient.id} style={{ gap: spacing.xs }}>
                <AppText variant="label" dir={dir}>{recipeFoodName(ingredient, language)}</AppText>
                <AppText dir={dir}>{recipeQuantity(scaleMealAmount(ingredient.quantity, String(recipe.servings), count), ingredient.unit, language)}</AppText>
                {status && <AppText dir={dir}>{status}</AppText>}
              </View>;
            })}
          </Card>}
          <SectionHeader title={t.overview} />
          {steps.map((step, index) => <View key={step.id} style={{ gap: spacing.xs }}>
            <Chip label={`${t.step} ${recipeNumber(index + 1, language)} · ${session.completed.includes(index) ? t.completed : t.remaining}`} selected={current === index}
              onPress={() => update(current => selectCookingStep(current, index, steps.length))} />
            <AppText variant="caption" muted dir="ltr">{step.instruction}</AppText>
            {step.durationMin !== null && <AppText variant="caption" muted dir={dir}>{duration(step.durationMin)}</AppText>}
          </View>)}
        </>}
      </>}
  </Screen></SafeAreaView>;
}
