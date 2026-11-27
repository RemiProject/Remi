import { useEffect } from 'react';
import { energyLabel } from '@/domain/nutrition';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui/core';
import { RecipeCard, RecipeGrid, useGridCardWidth } from '@/components/recipe-card';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { homeMessages } from '@/i18n/home';
import { recipeMessages } from '@/i18n/recipes';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeCoverage, recipeExpiry, recipeNumber } from '@/utils/backend-recipe-view';
import { spacing } from '@/theme/tokens';

/** Recipes ranked by what is in Kitchen, as a 2-column grid. `header={false}` when the parent supplies tabs and a title. */
export function BackendHomeRecipeIdeas({ kitchenStatus, title, header = true, limit = 4 }: { kitchenStatus: string; title?: string; header?: boolean; limit?: number }) {
  const state = useBackendRecipes();
  const { owner, ensureLoaded, kitchenEmpty } = state;
  const { language } = useLanguage();
  const width = useGridCardWidth();
  const rtl = language === 'ar', dir = rtl ? 'rtl' : 'ltr';
  const t = backendRecipeMessages[language], home = homeMessages[language];
  useEffect(() => {
    if (owner && kitchenStatus === 'ready' && !kitchenEmpty) void ensureLoaded();
  }, [owner, kitchenStatus, kitchenEmpty, ensureLoaded]);
  const signedOut = state.status === 'signed-out';
  const empty = kitchenEmpty || state.status === 'ready' && !state.nodes.length;
  return <View style={{ gap: spacing.md, direction: dir }}>
    {header && <View style={{ flexDirection: 'row', direction: dir, alignItems: 'center', gap: spacing.md }}>
      <AppText variant="heading" dir={dir} style={{ flex: 1 }}>{title ?? home.ideas}</AppText>
      {!signedOut && <Button label={recipeMessages[language].viewAll} variant="text"
        onPress={() => router.push({ pathname: '/feature', params: { feature: 'recipes' } })} />}
    </View>}
    {signedOut ? <><AppText muted dir={dir}>{t.homeSignIn}</AppText><Button label={t.signIn} onPress={() => router.push('/login')} /></>
      : empty ? <><AppText muted dir={dir}>{t.homeEmpty}</AppText><Button label={t.add} onPress={() => router.push('/food-entry')} /></>
      : state.status === 'error' || kitchenStatus === 'error' ? <><AppText muted dir={dir}>{t.error}</AppText><Button label={t.retry} variant="text" onPress={state.refresh} /></>
      : state.status !== 'ready' ? <AppText muted dir={dir} accessibilityLiveRegion="polite">{t.loading}</AppText>
      : <RecipeGrid>{state.nodes.slice(0, limit).map(node => {
          const recipe = node.recipe;
          const time = recipe.prepTimeMin === null || recipe.cookTimeMin === null ? null : `${recipeNumber(recipe.prepTimeMin + recipe.cookTimeMin, language)} ${t.minutes}`;
          return <RecipeCard key={recipe.id} id={recipe.id} name={recipe.name} time={time} caption={recipeCoverage(node, language)} energy={energyLabel(recipe.nutrition, language)} note={recipeExpiry(node, state.today, language)} width={width}
            onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} />;
        })}</RecipeGrid>}
  </View>;
}
