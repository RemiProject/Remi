import { Redirect, router } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { useOnboarding } from '@/providers/onboarding-provider';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, View } from 'react-native';
import type { Ref, ComponentRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/core';
import { Icon, type IconName } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
function TabButton({ children, isFocused, icon, ref, ...props }: TabTriggerSlotProps & { icon: IconName }) {
  const { colors } = useRemyTheme();
  return <Pressable {...props} ref={ref as Ref<ComponentRef<typeof Pressable>>} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={({ pressed }) => ({ flex: 1, minHeight: 56, padding: 4, gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.pressedSurface : 'transparent', borderRadius: 12 })}>
    <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isFocused ? colors.navSelected : 'transparent' }}><Icon name={icon} size={22} color={isFocused ? colors.text : colors.textSecondary} /></View>
    <AppText variant={isFocused ? 'label' : 'caption'} style={{ fontSize: 12, lineHeight: 16, color: isFocused ? colors.text : colors.textSecondary }}>{children}</AppText>
  </Pressable>;
}
export default function TabLayout() {
  const { colors } = useRemyTheme(); const { language } = useLanguage(); const ar = language === 'ar';
  const { user } = useAuth(); const onboarding = useOnboarding();
  // First signed-in run on this device goes to onboarding (plans and lists need an account). A read error just shows the app.
  if (user && onboarding.status === 'ready' && !onboarding.record) return <Redirect href="/onboarding" />;
  return <SafeAreaView edges={['top','bottom','left','right']} style={{ flex: 1, backgroundColor: colors.background }}><Tabs style={{ flex: 1 }}><TabSlot style={{ flex: 1 }} />
    <TabList style={{ flexDirection: ar ? 'row-reverse' : 'row', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderColor: colors.divider, backgroundColor: colors.navSurface }}>
      <TabTrigger name="home" href="/" asChild><TabButton icon="home">{ar ? 'الرئيسية' : 'Home'}</TabButton></TabTrigger>
      <TabTrigger name="kitchen" href="/kitchen" asChild><TabButton icon="kitchen">{ar ? 'المطبخ' : 'Kitchen'}</TabButton></TabTrigger>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إضافة سريعة' : 'Quick add'} onPress={() => router.push('/quick-add')}
        style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1, boxShadow: `0 6px 16px ${colors.shadow}` })}>
        <Icon name="add" size={28} color={colors.onAccent} />
      </Pressable></View>
      <TabTrigger name="nutrition" href="/nutrition" asChild><TabButton icon="nutrition">{ar ? 'التغذية' : 'Nutrition'}</TabButton></TabTrigger>
      <TabTrigger name="more" href="/more" asChild><TabButton icon="more">{ar ? 'المزيد' : 'More'}</TabButton></TabTrigger>
    </TabList>
  </Tabs></SafeAreaView>;
}
