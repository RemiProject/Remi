import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/core';
import { useLanguage } from '@/providers/language-provider';
import { connectivity } from '@/services/connectivity';
import { useRemyTheme } from '@/theme/provider';

/** A quiet strip under the status bar while the server can't be reached. It never blocks a tap. */
export function OfflineBanner() {
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline, () => false);
  const { colors } = useRemyTheme(); const { top } = useSafeAreaInsets(); const { language } = useLanguage();
  if (!offline) return null;
  return <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} pointerEvents="none" accessibilityLiveRegion="polite"
    style={{ position: 'absolute', top: top + 4, left: 0, right: 0, alignItems: 'center' }}>
    <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.text }}>
      <AppText variant="caption" style={{ color: colors.background }}>
        {language === 'ar' ? 'لا يوجد اتصال. تعرض ريمي آخر ما حمّلته.' : 'Offline. Showing what Remi last loaded.'}
      </AppText>
    </View>
  </Animated.View>;
}
