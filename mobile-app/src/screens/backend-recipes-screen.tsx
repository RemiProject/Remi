import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Badge, Button, Card, EmptyState, PageHeader, Screen, SectionHeader, uiStyles } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeCoverage, recipeExpiry, recipeFoodName, recipeIngredientStatus, recipeMetadata, recipeMissing, recipeNumber, recipeQuantity } from '@/utils/backend-recipe-view';
import { radii, spacing } from '@/theme/tokens';

function useLabels() {
  const { language } = useLanguage();
  return { language, rtl: language === 'ar', t: backendRecipeMessages[language] };
}
function RecipePlaceholder() {
  const { t } = useLabels();
  const { colors } = useRemyTheme();
  return <View accessibilityRole="image" accessibilityLabel={t.placeholder} style={{ height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
    <Icon name="recipe" size={40} color={colors.textSubtle} />
  </View>;
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

export function BackendRecipesScreen() {
  const state = useBackendRecipes();
  const { owner, refresh } = state;
  const { t, language, rtl } = useLabels();
  const { colors } = useRemyTheme();
  useFocusEffect(useCallback(() => { if (owner) void refresh(); }, [owner, refresh]));
  const empty = state.status === 'ready' && (state.kitchenEmpty || !state.nodes.length);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}
    refreshControl={<RefreshControl refreshing={state.status === 'loading'} onRefresh={state.refresh} />}>
    <PageHeader title={t.title} subtitle={t.intro} action={<Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    <RecipeState status={state.status} retry={state.refresh} />
    {state.status === 'ready' && <Button label={t.refresh} variant="text" onPress={state.refresh} />}
    {empty && <EmptyState title={t.empty} description={t.emptyBody} action={t.add} onPress={() => router.push('/food-entry')} />}
    {state.status === 'ready' && !empty && state.nodes.map(node => {
      const missing = recipeMissing(node, language), expiry = recipeExpiry(node, state.today, language);
      return <Pressable key={node.recipe.id} accessibilityRole="button" accessibilityLabel={node.recipe.name}
        onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: node.recipe.id } })}
        style={({ pressed }) => ({ borderRadius: radii.lg, overflow: 'hidden', backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
        <RecipePlaceholder /><View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <AppText variant="heading" dir="ltr">{node.recipe.name}</AppText>
          <AppText variant="caption" dir={rtl ? 'rtl' : 'ltr'}>{recipeMetadata(node.recipe, language)}</AppText>
          <AppText dir={rtl ? 'rtl' : 'ltr'}>{recipeCoverage(node, language)}</AppText>
          {missing && <AppText muted dir={rtl ? 'rtl' : 'ltr'}>{missing}</AppText>}
          {expiry && <AppText dir={rtl ? 'rtl' : 'ltr'}>{expiry}</AppText>}
          <SafetyWarnings warnings={node.safetyWarnings} />
        </View>
      </Pressable>;
    })}
    {state.moreError && <AppText accessibilityRole="alert">{t.moreError}</AppText>}
    {state.status === 'ready' && !empty && state.hasNextPage && <Button label={state.loadingMore ? t.loading : state.moreError ? t.retry : t.more} disabled={state.loadingMore} onPress={state.loadMore} />}
  </Screen></SafeAreaView>;
}

export function BackendRecipeDetailScreen({ id }: { id: string }) {
  const state = useBackendRecipes();
  const { owner, loadDetail } = state;
  const { t, rtl, language } = useLabels();
  const { colors } = useRemyTheme();
  useFocusEffect(useCallback(() => { if (owner) void loadDetail(id); }, [owner, loadDetail, id]));
  const detail = state.detail?.id === id ? state.detail : null;
  const status = state.status === 'signed-out' ? 'signed-out' : detail?.status ?? (state.status === 'error' ? 'error' : 'loading');
  const recipe = status === 'ready' ? detail?.recipe : undefined;
  const retry = () => { void state.loadDetail(id); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/feature', params: { feature: 'recipes' } })} />
    <RecipeState status={status} retry={state.status === 'error' && !state.owner ? state.refresh : retry} />
    {recipe && <>
      <SafetyWarnings detail warnings={detail?.suggestion?.safetyWarnings ?? []} />
      <RecipePlaceholder /><AppText variant="title" dir="ltr">{recipe.name}</AppText>
      <AppText dir={rtl ? 'rtl' : 'ltr'}>{recipeMetadata(recipe, language)}</AppText>
      {recipe.description && <><SectionHeader title={t.description} /><AppText dir="ltr">{recipe.description}</AppText></>}
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
      <SectionHeader title={t.steps} />
      {!recipe.steps.length && <AppText muted>{t.noSteps}</AppText>}
      {recipe.steps.map(step => <Card key={step.id}>
        <AppText variant="label" dir={rtl ? 'rtl' : 'ltr'}>{recipeNumber(step.stepNumber, language)}{step.durationMin !== null ? ` · ${recipeNumber(step.durationMin, language)} ${t.minutes}` : ''}</AppText>
        <AppText dir="ltr">{step.instruction}</AppText>
      </Card>)}
    </>}
  </Screen></SafeAreaView>;
}
