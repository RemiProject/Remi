import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Chip, EmptyState, PageHeader, Screen, SearchField, uiStyles } from '@/components/ui/core';
import { FoodImage } from '@/components/food-image';
import { recipePhotos, recipeTitle, recipeDescription } from '@/data/home-content';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { recipeMessages } from '@/i18n/recipes';
import { discoverRecipes } from '@/utils/recipe-view';
import { radii, spacing } from '@/theme/tokens';

export default function RecipesScreen() {
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = recipeMessages[language];
  const rtl = language === 'ar';
  const [query, setQuery] = useState('');
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const recipes = discoverRecipes(query, language, maxMinutes);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <PageHeader title={t.title} subtitle={t.intro} action={<Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    <AppText variant="caption" muted>{t.sample}</AppText>
    <SearchField value={query} onChangeText={setQuery} placeholder={t.search} accessibilityLabel={t.search} autoCorrect={false} style={{ textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }} />
    <View style={uiStyles.wrap}>{([null, 10, 20] as const).map((value) => <Chip key={value ?? 'all'} label={value === null ? t.all : value === 10 ? t.quick : t.twenty} selected={maxMinutes === value} onPress={() => setMaxMinutes(value)} />)}</View>
    {!recipes.length && <EmptyState title={t.empty} description={t.emptyBody} action={t.clear} onPress={() => { setQuery(''); setMaxMinutes(null); }} />}
    {recipes.map((recipe) => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={`${recipeTitle(recipe.id, language)}. ${t.open}`} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.pressedSurface : colors.surface, borderRadius: radii.lg, overflow: 'hidden' })}>
      <FoodImage uri={recipePhotos[recipe.id]} height={180} label={t.photo} />
      <View style={{ gap: spacing.sm, padding: spacing.lg }}><AppText variant="heading">{recipeTitle(recipe.id, language)}</AppText><AppText variant="caption" muted>{t.time}: {recipe.minutes.toLocaleString(language)} {t.minutes}</AppText><AppText muted>{recipeDescription(recipe.id, language)}</AppText></View>
    </Pressable>)}
  </Screen></SafeAreaView>;
}
