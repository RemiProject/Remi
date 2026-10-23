import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { FoodImage } from '@/components/food-image';
import { demoRecipes } from '@/data/kitchen-demo';
import { recipePhotos, recipeTitle } from '@/data/home-content';
import { homeMessages, homeUnitLabels } from '@/i18n/home';
import { recipeMessages, sampleSteps } from '@/i18n/recipes';
import { useInventory } from '@/providers/inventory-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { ingredientMatches } from '@/utils/recipe-view';
import { spacing } from '@/theme/tokens';
import { cookingMessages } from '@/i18n/cooking';
import { cookingInstructions } from '@/utils/cooking-session';

export default function RecipeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetail key={id} id={id} />;
}
function RecipeDetail({ id }: { id: string }) {
  const { language } = useLanguage();
  const { items, status, retryRead } = useInventory();
  const { colors } = useRemyTheme();
  const t = recipeMessages[language];
  const rtl = language === 'ar';
  const recipe = demoRecipes.find((entry) => entry.id === id);
  const steps = cookingInstructions(sampleSteps[language], id);
  const [completed, setCompleted] = useState<ReadonlySet<number>>(() => new Set());
  const browse = () => router.replace({ pathname: '/feature', params: { feature: 'recipes' } });
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : browse()} />
    {!recipe ? <EmptyState title={t.missing} description={t.missingBody} action={t.browse} onPress={browse} /> : <>
      <FoodImage uri={recipePhotos[recipe.id]} height={220} label={t.photo} />
      <PageHeader title={recipeTitle(recipe.id, language)} subtitle={Number.isFinite(recipe.minutes) && recipe.minutes > 0 ? `${t.time}: ${recipe.minutes.toLocaleString(language)} ${t.minutes}` : undefined} />
      <AppText variant="caption" muted>{t.sample}</AppText>
      <Button label={cookingMessages[language].start} disabled={!steps.length} onPress={() => router.push({ pathname: '/cooking/[id]', params: { id } })} />
      <SectionHeader title={t.ingredients} /><AppText variant="caption" muted>{t.quantities}</AppText><AppText variant="caption" muted>{t.matchNote}</AppText>
      {status !== 'ready' && <Card><AppText accessibilityLiveRegion="polite">{status === 'error' ? t.readError : t.loading}</AppText>{status === 'error' && <Button label={t.retry} onPress={() => { void retryRead(); }} />}</Card>}
      {recipe.ingredients.map((ingredient) => {
        const matches = status === 'ready' ? ingredientMatches(ingredient, items) : [];
        return <Card key={ingredient}><AppText variant="label">{homeMessages[language][ingredient]}</AppText>
          {status === 'ready' && <AppText variant="caption" muted>{matches.length ? t.matched : t.notMatched}</AppText>}
          {matches.map((item) => <Button key={item.id} label={`${item.name} · ${item.quantity.toLocaleString(language)} ${homeUnitLabels[language][item.unitId]}`} variant="text" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })} />)}
        </Card>;
      })}
      <SectionHeader title={t.steps} /><AppText variant="caption" muted>{t.stepNote}</AppText>
      {!steps.length && <AppText muted>{cookingMessages[language].missingBody}</AppText>}
      <AppText accessibilityLiveRegion="polite">{completed.size.toLocaleString(language)} / {steps.length.toLocaleString(language)} {t.progress}</AppText>
      {steps.map((step, index) => <Card key={index}><View style={{ gap: spacing.sm }}>
        <AppText variant="label">{(index + 1).toLocaleString(language)} · {completed.has(index) ? t.completed : t.remaining}</AppText><AppText>{step}</AppText>
        <Chip label={completed.has(index) ? t.undo : t.complete} selected={completed.has(index)} onPress={() => setCompleted((previous) => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
      </View></Card>)}
    </>}
  </Screen></SafeAreaView>;
}
