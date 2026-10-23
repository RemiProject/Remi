import { useLanguage } from '@/providers/language-provider';
import { appMessages, featureMessages, menuGroupLabels } from '@/i18n/app';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ActionRow, AppText, Card, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { featureGroups } from '@/data/feature-menu';
import { AppearanceControls } from '@/components/appearance-controls';
import { spacing } from '@/theme/tokens';

export default function MoreScreen() {
  const { language } = useLanguage();
  const t = appMessages[language];
  const rtl = language === 'ar';
  return <Screen rtl={rtl}>
    <PageHeader title={t.more} subtitle={t.moreSubtitle} />
    <AppearanceControls />
    <AppText variant="caption" muted>{t.previews}</AppText>
    {featureGroups.map((group) => <View key={group.title} style={{ gap: spacing.sm }}>
      <SectionHeader title={menuGroupLabels[language][group.title as keyof typeof menuGroupLabels.en]} />
      <Card style={{ padding: 0, gap: 0 }}>{group.items.map((item, index) => <ActionRow key={item.id} rtl={rtl} title={featureMessages[language][item.id].title} icon={item.icon} divider={index > 0}
        subtitle={item.unavailable ? t.unavailable : item.id === 'cooking' ? featureMessages[language][item.id].description : undefined}
        accessibilityLabel={`${featureMessages[language][item.id].title}. ${item.id === 'cooking' ? featureMessages[language][item.id].description : item.id === 'settings' ? t.settingsAction : item.id === 'recipes' ? t.recipesAction : item.id === 'planner' ? t.plannerAction : item.id === 'shopping' ? t.shoppingAction : item.unavailable ? t.unavailable : t.preview}`}
        onPress={() => router.push({ pathname: '/feature', params: { feature: item.id } })} />)}</Card>
    </View>)}
    <AppText variant="caption" muted>{t.local}</AppText>
  </Screen>;
}
