import { useEffect } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Button } from '@/components/ui/core';
import { RecipePlaceholder } from '@/components/recipe-placeholder';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { homeMessages } from '@/i18n/home';
import { recipeMessages } from '@/i18n/recipes';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { recipeCoverage, recipeExpiry, recipeNumber } from '@/utils/backend-recipe-view';
import { radii, spacing } from '@/theme/tokens';

export function BackendHomeRecipeIdeas({ kitchenStatus, title }: { kitchenStatus: string; title?: string }) {
  const state = useBackendRecipes();
  const { owner, ensureLoaded, kitchenEmpty } = state;
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const rtl = language === 'ar', dir = rtl ? 'rtl' : 'ltr';
  const t = backendRecipeMessages[language], home = homeMessages[language];
  useEffect(() => {
    if (owner && kitchenStatus === 'ready' && !kitchenEmpty) void ensureLoaded();
  }, [owner, kitchenStatus, kitchenEmpty, ensureLoaded]);
  const signedOut = state.status === 'signed-out';
  const empty = kitchenEmpty || state.status === 'ready' && !state.nodes.length;
  return <View style={{ gap: spacing.md, direction: dir }}>
    <View style={{ flexDirection: 'row', direction: dir, alignItems: 'center', gap: spacing.md }}>
      <AppText variant="heading" dir={dir} style={{ flex: 1 }}>{title ?? home.ideas}</AppText>
      {!signedOut && <Button label={recipeMessages[language].viewAll} variant="text"
        onPress={() => router.push({ pathname: '/feature', params: { feature: 'recipes' } })} />}
    </View>
    {signedOut ? <><AppText muted dir={dir}>{t.homeSignIn}</AppText><Button label={t.signIn} onPress={() => router.push('/login')} /></>
      : empty ? <><AppText muted dir={dir}>{t.homeEmpty}</AppText><Button label={t.add} onPress={() => router.push('/food-entry')} /></>
      : state.status === 'error' || kitchenStatus === 'error' ? <><AppText muted dir={dir}>{t.error}</AppText><Button label={t.retry} variant="text" onPress={state.refresh} /></>
      : state.status !== 'ready' ? <AppText muted dir={dir} accessibilityLiveRegion="polite">{t.loading}</AppText>
      : <ScrollView horizontal style={{ direction: dir }} contentContainerStyle={{ gap: spacing.md }}>
        {state.nodes.slice(0, 4).map(node => {
          const recipe = node.recipe, expiry = recipeExpiry(node, state.today, language);
          const time = recipe.prepTimeMin === null || recipe.cookTimeMin === null ? t.timeUnknown : `${recipeNumber(recipe.prepTimeMin + recipe.cookTimeMin, language)} ${t.minutes}`;
          return <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={recipe.name}
            onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })}
            style={({ pressed }) => ({ width: 258, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
            <RecipePlaceholder label={t.placeholder} name={recipe.name} id={recipe.id} />
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <AppText variant="heading" dir="ltr">{recipe.name}</AppText>
              <AppText variant="caption" muted dir={dir}>{time}</AppText>
              <AppText dir={dir}>{recipeCoverage(node, language)}</AppText>
              {expiry && <AppText dir={dir}>{expiry}</AppText>}
            </View>
          </Pressable>;
        })}
      </ScrollView>}
  </View>;
}
