import ShoppingScreen from '@/screens/shopping-screen';
import PlannerScreen from '@/screens/planner-screen';
import RecipesScreen from '@/screens/recipes-screen';
import { appMessages, featureMessages } from '@/i18n/app';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Badge, Button, Card, Screen, PageHeader } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { menuItems } from '@/data/feature-menu';
import { useRemyTheme } from '@/theme/provider';
import { LanguageControls } from '@/components/language-controls';
import { useLanguage } from '@/providers/language-provider';
import { inventoryMessages } from '@/i18n/inventory';
import { cookingMessages } from '@/i18n/cooking';
import { AppearanceControls } from '@/components/appearance-controls';

export default function FeaturePreview() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const item = menuItems.find((entry) => entry.id === feature);
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = inventoryMessages[language];
  const a = appMessages[language];
  const rtl = language === 'ar';
  const copy = item ? featureMessages[language][item.id] : undefined;
  if (item?.id === 'shopping') return <ShoppingScreen />;
  if (item?.id === 'planner') return <PlannerScreen />;
  if (item?.id === 'recipes') return <RecipesScreen />;
  if (item?.id === 'cooking') return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={a.backMore} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />
    <PageHeader title={cookingMessages[language].title} subtitle={cookingMessages[language].intro} />
    <Button label={cookingMessages[language].choose} onPress={() => router.push({ pathname: '/feature', params: { feature: 'recipes' } })} />
  </Screen></SafeAreaView>;
  if (item?.id === 'settings') return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Screen rtl={rtl}><Button label={t.backMore} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />
      <AppText variant="title">{t.settings}</AppText>
      <Card style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}><AppText variant="heading">{t.language}</AppText><LanguageControls /></Card>
      <Card><AppearanceControls /></Card>
      <AppText muted>{t.settingsNote}</AppText>
    </Screen>
  </SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={a.backMore} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />
    <AppText variant="title">{copy?.title ?? a.missing}</AppText>
    <Card><Icon name={item?.icon ?? 'info'} size={36} />
      <Badge tone="unavailable" label={item?.unavailable ? a.unavailable : a.notImplemented} />
      <AppText muted>{copy?.description ?? a.missingBody}</AppText>
      <AppText variant="caption" muted>{a.notice}</AppText>
    </Card>
  </Screen></SafeAreaView>;
}
