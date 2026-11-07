import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Badge, Button, Card, EmptyState, PageHeader, Screen, SectionHeader, uiStyles } from '@/components/ui/core';
import { RecipeCard, RecipeGrid, useGridCardWidth } from '@/components/recipe-card';
import { RecipePlaceholder } from '@/components/recipe-placeholder';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { cookedItMessages } from '@/i18n/cooked-it';
import { cookingMessages } from '@/i18n/cooking';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeCoverage, recipeExpired, recipeExpiry, recipeFoodName, recipeIngredientStatus, recipeMetadata, recipeMissing, recipeNumber, recipeQuantity } from '@/utils/backend-recipe-view';

function useLabels() {
  const { language } = useLanguage();
  return { language, rtl: language === 'ar', t: backendRecipeMessages[language] };
}
function RecipeState({ status, retry }: { status: string; retry: () => void }) {
  const { t } = useLabels();
  if (status === 'signed-out') return <EmptyState title={t.signInTitle} description={t.signInBody} action={t.signIn} onPress={() => router.push('/login')} />;
  if (status === 'loading' || status === 'idle') return <View style={uiStyles.row}><ActivityIndicator /><AppText accessibilityLiveRegion="polite">{t.loading}</AppText></View>;
  if (status === 'error') return <Card><AppText accessibilityRole="alert">{t.error}</AppText><Button label={t.retry} onPress={retry} /></Card>;
  return null;
}
function SafetyWarnings({ warnings, detail = false }: { warnings: string[]; detail?: boolean }) {
  const { t } = useLabels();
  if (!warnings.length) return null;
  const labels: Record<string, string> = t;
  return <Card><Badge label={t.warnings} tone="warning" />{detail && <>
    <AppText>{t.warningBody}</AppText>{warnings.map(code => <AppText key={code}>{labels[code] ?? t.otherWarning}</AppText>)}
  </>}</Card>;
}

export function BackendRecipesScreen({ onBrowseAll }: { onBrowseAll?: () => void } = {}) {
  const state = useBackendRecipes();
  const { owner, ensureLoaded } = state;
  const { t, language, rtl } = useLabels();
  const { colors } = useRemyTheme(); const width = useGridCardWidth();
  useFocusEffect(useCallback(() => { if (owner) void ensureLoaded(); }, [owner, ensureLoaded]));
  const empty = state.status === 'ready' && (state.kitchenEmpty || !state.nodes.length);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}
    refreshControl={<RefreshControl refreshing={state.status === 'loading'} onRefresh={state.refresh} />}>
    <PageHeader title={onBrowseAll ? (language === 'ar' ? 'كتاب الطبخ' : 'The cookbook') : t.title} subtitle={t.intro} back={<Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    {onBrowseAll && <Button label={language === 'ar' ? 'تصفح كل الوصفات' : 'Browse all recipes'} variant="secondary" onPress={onBrowseAll} />}
    <RecipeState status={state.status} retry={state.refresh} />
    {state.status === 'ready' && <Button label={t.refresh} variant="text" onPress={state.refresh} />}
    {empty && <EmptyState title={t.empty} description={t.emptyBody} action={t.add} onPress={() => router.push('/food-entry')} />}
    {state.status === 'ready' && !empty && <RecipeGrid>{state.nodes.map(node => {
      const recipe = node.recipe, dir = rtl ? 'rtl' : 'ltr';
      const time = recipe.prepTimeMin === null || recipe.cookTimeMin === null ? null : `${recipeNumber(recipe.prepTimeMin + recipe.cookTimeMin, language)} ${t.minutes}`;
      return <RecipeCard key={recipe.id} id={recipe.id} name={recipe.name} time={time} width={width} textDir={dir}
        caption={recipeCoverage(node, language)} details={[recipeMissing(node, language), recipeExpired(node, language)]} note={recipeExpiry(node, state.today, language)}
        extra={node.safetyWarnings.length > 0 ? <Badge label={t.warnings} tone="warning" /> : undefined}
        onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} />;
    })}</RecipeGrid>}
    {state.moreError && <AppText accessibilityRole="alert">{t.moreError}</AppText>}
    {state.status === 'ready' && !empty && state.hasNextPage && <Button label={state.loadingMore ? t.loading : state.moreError ? t.retry : t.more} disabled={state.loadingMore} onPress={state.loadMore} />}
  </Screen></SafeAreaView>;
}

export function BackendRecipeDetailScreen({ id }: { id: string }) {
  const state = useBackendRecipes();
  const { owner, ensureDetail, dismissMealRemoved } = state;
  const { t, rtl, language } = useLabels();
  const { colors } = useRemyTheme();
  useFocusEffect(useCallback(() => { if (owner) void ensureDetail(id); }, [owner, ensureDetail, id]));
  const notice = state.removedNotice?.recipeId === id ? state.removedNotice : null;
  useFocusEffect(useCallback(() => {
    if (!owner || !notice) return;
    const timer = setTimeout(() => dismissMealRemoved(notice.id), 3500);
    return () => clearTimeout(timer);
  }, [owner, notice, dismissMealRemoved]));
  const detail = state.detail?.id === id ? state.detail : null;
  const status = state.status === 'signed-out' ? 'signed-out' : detail?.status ?? (state.status === 'error' ? 'error' : 'loading');
  const recipe = status === 'ready' ? detail?.recipe : undefined;
  const retry = () => { void state.loadDetail(id); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/feature', params: { feature: 'recipes' } })} />
    <RecipeState status={status} retry={state.status === 'error' && !state.owner ? state.refresh : retry} />
    {owner && notice && <Card><AppText accessibilityLiveRegion="polite" dir={rtl ? 'rtl' : 'ltr'}>{cookedItMessages[language].removed}</AppText></Card>}
    {recipe && <>
      <SafetyWarnings detail warnings={detail?.suggestion?.safetyWarnings ?? []} />
      <RecipePlaceholder label={t.placeholder} name={recipe.name} id={recipe.id} /><AppText variant="title" dir="ltr">{recipe.name}</AppText>
      <AppText dir={rtl ? 'rtl' : 'ltr'}>{recipeMetadata(recipe, language)}</AppText>
      {recipe.description && <><SectionHeader title={t.description} /><AppText dir="ltr">{recipe.description}</AppText></>}
      <Button label={cookedItMessages[language].cooked} onPress={() => router.push({ pathname: '/cooked-it', params: { id } })} />
      <SectionHeader title={t.ingredients} />
      {detail?.matchingLoading && <AppText accessibilityLiveRegion="polite">{t.matchingLoading}</AppText>}
      {detail?.matchingError && <Card><AppText accessibilityRole="alert">{t.matchingError}</AppText><Button label={t.retry} onPress={retry} /></Card>}
      {!detail?.matchingLoading && !detail?.matchingError && !detail?.suggestion && <AppText muted>{t.matchingUnavailable}</AppText>}
      {recipe.ingredients.map(ingredient => {
        const status = recipeIngredientStatus(ingredient, detail?.suggestion, language);
        return <Card key={ingredient.id}>
          <AppText variant="label" dir={rtl ? 'rtl' : 'ltr'}>{recipeFoodName(ingredient, language)}</AppText>
          <AppText dir={rtl ? 'rtl' : 'ltr'}>{recipeQuantity(ingredient.quantity, ingredient.unit, language)}</AppText>
          {status && <AppText dir={rtl ? 'rtl' : 'ltr'}>{status}</AppText>}
        </Card>;
      })}
      {recipe.steps.length > 0 && <Button label={cookingMessages[language].start} onPress={() => router.push({ pathname: '/cooking/[id]', params: { id } })} />}
      <SectionHeader title={t.steps} />
      {!recipe.steps.length && <AppText muted>{t.noSteps}</AppText>}
      {recipe.steps.map(step => <Card key={step.id}>
        <AppText variant="label" dir={rtl ? 'rtl' : 'ltr'}>{recipeNumber(step.stepNumber, language)}{step.durationMin !== null ? ` · ${recipeNumber(step.durationMin, language)} ${t.minutes}` : ''}</AppText>
        <AppText dir="ltr">{step.instruction}</AppText>
      </Card>)}
    </>}
  </Screen></SafeAreaView>;
}
