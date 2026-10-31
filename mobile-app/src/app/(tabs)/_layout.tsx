import { useLanguage } from '@/providers/language-provider';
import { appMessages } from '@/i18n/app';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { router } from 'expo-router';
import { useState, type ComponentRef, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing, layout } from '@/theme/tokens';
import { AppText } from '@/components/ui/core';
import { Icon, type IconName } from '@/components/ui/icon';

function TabButton({ children, isFocused, emphasized, icon, onPress, onLongPress, onFocus, onBlur, ref, ...props }: TabTriggerSlotProps & { emphasized?: boolean; icon: IconName }) {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = appMessages[language];
  const [focused, setFocused] = useState(false);
  return (
    <Pressable {...props} ref={ref as unknown as Ref<ComponentRef<typeof Pressable>>} accessibilityRole={emphasized ? 'button' : 'tab'} accessibilityLabel={emphasized ? t.addAction : undefined}
      accessibilityState={emphasized ? {} : { selected: !!isFocused }}
      onPress={emphasized ? () => router.push('/food-entry') : onPress}
      onLongPress={emphasized ? undefined : onLongPress}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.pressedSurface : 'transparent', borderWidth: focused ? 3 : 2, borderColor: focused ? colors.focusBorder : 'transparent' }]}>
      <View style={[styles.symbol, { backgroundColor: emphasized ? colors.primary : isFocused ? colors.navSelected : 'transparent' }]}>
        <Icon name={icon} size={emphasized ? 28 : 22} color={emphasized ? colors.onPrimary : isFocused ? colors.primary : colors.textSecondary} />
      </View>
      <AppText variant="caption" style={{ color: isFocused ? colors.text : colors.textSecondary, fontWeight: isFocused ? '700' : '400', textDecorationLine: isFocused && !emphasized ? 'underline' : 'none', textAlign: 'center', width: '100%' }}>{children}</AppText>
    </Pressable>
  );
}

export default function TabLayout() {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = appMessages[language];
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.navSurface }}>
      <Tabs style={{ flex: 1 }}>
        <TabSlot style={{ flex: 1 }} />
        <TabList style={[styles.list, { backgroundColor: colors.navSurface, borderColor: colors.divider, direction: 'ltr' }]}>
          <TabTrigger name="home" href="/" asChild><TabButton icon="home">{t.home}</TabButton></TabTrigger>
          <TabTrigger name="kitchen" href="/kitchen" asChild><TabButton icon="kitchen">{t.kitchen}</TabButton></TabTrigger>
          <TabTrigger name="add" href="/add" asChild><TabButton icon="add" emphasized>{t.add}</TabButton></TabTrigger>
          <TabTrigger name="health" href="/health" asChild><TabButton icon="health">{t.health}</TabButton></TabTrigger>
          <TabTrigger name="more" href="/more" asChild><TabButton icon="more">{t.more}</TabButton></TabTrigger>
        </TabList>
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  button: { flex: 1, minWidth: 0, minHeight: layout.minTouchTarget, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  symbol: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
});
