import { ConnectedRecipesScreen } from './connected-recipes-screen';
import { ConnectedPlannerScreen } from './connected-planner-screen';
import { ConnectedShoppingScreen } from './connected-shopping-screen';
import { ConnectedNotificationsScreen } from './connected-notifications-screen';
import { ConnectedHouseholdScreen } from './connected-household-screen';
import { ConnectedHealthScreen } from './connected-health-screen';
import AssistantScreen from './assistant-screen';
import LeftoversScreen from './leftovers-screen';
import ContactScreen from './contact-screen';
import IntakePhotosScreen from './intake-photos-screen';
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
import { FeelControls } from '@/components/feel-controls';
import { BackendConnection } from '@/components/backend-connection';
import ProfileScreen from '@/screens/profile-screen';

export default function FeaturePreview() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const item = menuItems.find((entry) => entry.id === feature);
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = inventoryMessages[language];
  const a = appMessages[language];
  const rtl = language === 'ar';
  const copy = item ? featureMessages[language][item.id] : undefined;
  if (feature === 'chat') return <AssistantScreen />;
  if (feature === 'leftovers') return <LeftoversScreen />;
  if (feature === 'contact') return <ContactScreen />;
  if (feature === 'photos') return <IntakePhotosScreen />;
  if (feature === 'notifications') return <ConnectedNotificationsScreen />;
  if (feature === 'community' || feature === 'household') return <ConnectedHouseholdScreen />;
  if (feature === 'health') return <ConnectedHealthScreen />;
  if (item?.id === 'shopping') return <ConnectedShoppingScreen />;
  if (item?.id === 'planner') return <ConnectedPlannerScreen />;
  if (item?.id === 'recipes') return <ConnectedRecipesScreen />;
  if (item?.id === 'profile') return <ProfileScreen />;
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
      <Card><FeelControls /></Card>
      <BackendConnection />
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
