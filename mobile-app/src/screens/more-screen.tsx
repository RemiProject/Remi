import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { ActionRow, AppText, Card, PageHeader, Screen, SectionHeader } from '@/components/ui/core';
import { sourcedImageCredits } from '@/data/food-images';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import type { IconName } from '@/components/ui/icon';
const groups: { title: string; ar: string; items: { id: string; name: string; ar: string; icon: IconName }[] }[] = [
  { title: 'Something good to cook', ar: 'وجبات لذيذة', items: [
    { id: 'recipes', name: 'The cookbook', ar: 'كتاب الطبخ', icon: 'recipe' },
    { id: 'shopping', name: 'Shopping list', ar: 'قائمة المشتريات', icon: 'shopping' },
    { id: 'leftovers', name: 'Leftovers', ar: 'بقايا الطعام', icon: 'food' },
    { id: 'chat', name: 'Kitchen helper', ar: 'مساعد المطبخ', icon: 'chat' },
  ] },
  { title: 'Your kitchen, together', ar: 'مطبخك في مكان واحد', items: [
    { id: 'community', name: 'Household & invitations', ar: 'الأسرة والدعوات', icon: 'community' },
    { id: 'notifications', name: 'Updates & reminders', ar: 'التحديثات والتذكيرات', icon: 'bell' },
    { id: 'photos', name: 'Kitchen photos', ar: 'صور المطبخ', icon: 'photo' },
  ] },
  { title: 'Made for you', ar: 'من أجلك', items: [
    { id: 'profile', name: 'Your account', ar: 'حسابك', icon: 'profile' },
    { id: 'health', name: 'Nutrition & preferences', ar: 'التغذية والتفضيلات', icon: 'health' },
    { id: 'settings', name: 'Settings', ar: 'الإعدادات', icon: 'settings' },
    { id: 'contact', name: 'Feedback & support', ar: 'الملاحظات والدعم', icon: 'contact' },
  ] },
];
export default function MoreScreen() {
  const { language } = useLanguage(); const ar = language === 'ar'; const { colors } = useRemyTheme();
  return <Screen rtl={ar}><PageHeader title={ar ? 'المزيد من Remi' : 'A little more Remi.'} subtitle={ar ? 'كل ما يجعل مطبخك ملكك.' : 'Everything that makes your kitchen yours.'} />
    {groups.map(group => <View key={group.title} style={{ gap: 12 }}><SectionHeader title={ar ? group.ar : group.title} /><Card style={{ padding: 0, gap: 0 }}>{group.items.map((item,index) => <ActionRow key={item.id} title={ar ? item.ar : item.name} icon={item.icon} rtl={ar} divider={index > 0} onPress={() => router.push({ pathname: '/feature', params: { feature: item.id } })} />)}</Card></View>)}
    <View style={{ gap: 4 }}>
      <AppText variant="caption" muted>{ar ? 'صور الأطباق والمكونات مولّدة بالذكاء الاصطناعي لأغراض توضيحية، باستثناء:' : 'Dish and ingredient photos are AI-generated illustrations, except:'}</AppText>
      {sourcedImageCredits.map(c => <AppText key={c.sourceUrl} variant="caption" accessibilityRole="link" onPress={() => { void Linking.openURL(c.sourceUrl); }} style={{ color: colors.primary }}>
        {`${c.subject.charAt(0).toUpperCase()}${c.subject.slice(1)} · ${c.author} · ${c.license}`}</AppText>)}
    </View>
    <AppText variant="caption" muted>{ar ? 'Remi Cookbook · الإصدار ٣' : 'Remi Cookbook · Version 3'}</AppText>
  </Screen>;
}
