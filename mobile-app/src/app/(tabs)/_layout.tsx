import { router } from 'expo-router';
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
  return <Pressable {...props} ref={ref as Ref<ComponentRef<typeof Pressable>>} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={({ pressed }) => ({ flex: 1, minHeight: 52, padding: 6, gap: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.pressedSurface : 'transparent', borderRadius: 12 })}>
    <Icon name={icon} size={22} color={isFocused ? colors.primary : colors.textSecondary} /><AppText variant="caption" style={{ color: isFocused ? colors.primary : colors.textSecondary, fontWeight: isFocused ? '700' : '400' }}>{children}</AppText>
  </Pressable>;
}
export default function TabLayout() {
  const { colors } = useRemyTheme(); const { language } = useLanguage(); const ar = language === 'ar';
  return <SafeAreaView edges={['top','bottom','left','right']} style={{ flex: 1, backgroundColor: colors.background }}><Tabs style={{ flex: 1 }}><TabSlot style={{ flex: 1 }} />
    <TabList style={{ flexDirection: ar ? 'row-reverse' : 'row', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderColor: colors.divider, backgroundColor: colors.background }}>
      <TabTrigger name="home" href="/" asChild><TabButton icon="home">{ar ? 'الرئيسية' : 'Home'}</TabButton></TabTrigger>
      <TabTrigger name="kitchen" href="/kitchen" asChild><TabButton icon="kitchen">{ar ? 'المطبخ' : 'Kitchen'}</TabButton></TabTrigger>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إضافة سريعة' : 'Quick add'} onPress={() => router.push('/quick-add')}
        style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.primaryPressed : colors.primary })}>
        <Icon name="add" size={28} color={colors.onPrimary} />
      </Pressable></View>
      <TabTrigger name="plan" href="/plan" asChild><TabButton icon="calendar">{ar ? 'الخطة' : 'Plan'}</TabButton></TabTrigger>
      <TabTrigger name="more" href="/more" asChild><TabButton icon="more">{ar ? 'المزيد' : 'More'}</TabButton></TabTrigger>
    </TabList>
  </Tabs></SafeAreaView>;
}
