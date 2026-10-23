import { useSyncExternalStore } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { demoRecipes } from '@/data/kitchen-demo';
import { recipeTitle } from '@/data/home-content';
import { sampleSteps } from '@/i18n/recipes';
import { cookingMessages } from '@/i18n/cooking';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { cookingSessions } from '@/services/cooking-sessions';
import { advanceCooking, cookingInstructions, initialCookingSession, selectCookingStep } from '@/utils/cooking-session';
import { radii, spacing } from '@/theme/tokens';

export default function CookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language } = useLanguage(); const t = cookingMessages[language]; const rtl = language === 'ar';
  const { colors } = useRemyTheme();
  const session = useSyncExternalStore(cookingSessions.subscribe, () => cookingSessions.get(id), () => initialCookingSession);
  const recipe = demoRecipes.find(entry => entry.id === id);
  const steps = cookingInstructions(sampleSteps[language], id);
  const browse = () => router.replace({ pathname: '/feature', params: { feature: 'recipes' } });
  const exit = () => router.canGoBack() ? router.back() : browse();
  const valid = !!recipe && steps.length > 0;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl} contentGap={spacing.lg}>
    <PageHeader title={t.title} action={<Button label={t.exit} variant="text" icon="back" rtl={rtl} onPress={exit} />} />
    {!valid ? <EmptyState title={t.missing} description={t.missingBody} action={t.choose} onPress={browse} /> : <>
      <AppText variant="heading">{recipeTitle(recipe.id, language)}</AppText>
      <AppText variant="caption" muted>{t.sample}</AppText>
      {session.finished ? <>
        <PageHeader title={t.done} subtitle={t.summary} />
        <AppText>{session.completed.length.toLocaleString(language)} / {steps.length.toLocaleString(language)} {t.progress}</AppText>
        <Button label={t.review} onPress={() => router.replace({ pathname: '/recipes/[id]', params: { id } })} />
        <Button label={t.choose} variant="secondary" onPress={browse} />
      </> : <>
        <AppText accessibilityLiveRegion="polite" variant="label">{t.step} {(session.current + 1).toLocaleString(language)} {t.of} {steps.length.toLocaleString(language)}</AppText>
        <View accessibilityRole="progressbar" accessibilityLabel={t.progress} accessibilityValue={{ min: 0, max: steps.length, now: session.completed.length }}
          style={{ height: 8, borderRadius: radii.md, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
          <View style={{ height: 8, width: `${session.completed.length / steps.length * 100}%`, backgroundColor: colors.primary }} />
        </View>
        <AppText variant="caption" muted>{session.completed.length.toLocaleString(language)} / {steps.length.toLocaleString(language)} {t.progress}</AppText>
        <Card><AppText variant="heading" accessibilityLiveRegion="polite">{steps[session.current]}</AppText></Card>
        <Button label={session.current === steps.length - 1 ? t.finish : t.next} onPress={() => cookingSessions.update(id, current => advanceCooking(current, steps.length))} />
        <Button label={t.previous} variant="secondary" disabled={session.current === 0} onPress={() => cookingSessions.update(id, current => selectCookingStep(current, current.current - 1, steps.length))} />
        <SectionHeader title={t.overview} />
        {steps.map((instruction, index) => <View key={index} style={{ gap: spacing.xs }}>
          <Chip label={`${t.step} ${(index + 1).toLocaleString(language)} · ${session.completed.includes(index) ? t.completed : t.remaining}`} selected={session.current === index}
            onPress={() => cookingSessions.update(id, current => selectCookingStep(current, index, steps.length))} />
          <AppText variant="caption" muted>{instruction}</AppText>
        </View>)}
      </>}
    </>}
  </Screen></SafeAreaView>;
}
