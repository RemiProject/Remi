import { View } from 'react-native';
import { AppText, Segmented, uiStyles } from '@/components/ui/core';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { appMessages } from '@/i18n/app';
import { appearanceMessages } from '@/i18n/appearance';

export function AppearanceControls() {
  const { appearance, setAppearance, saving, error, colors } = useRemyTheme();
  const { language } = useLanguage(); const t = appMessages[language]; const a = appearanceMessages[language];
  return <View style={uiStyles.stack}>
    <AppText variant="heading">{t.appearance}</AppText>
    <Segmented label={t.appearance} value={appearance} onChange={value => setAppearance(value as 'system' | 'light' | 'dark')}
      options={(['system', 'light', 'dark'] as const).map(value => ({ key: value, label: t[value] }))} />
    <AppText variant="caption" accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined} style={error ? { color: colors.errorText } : undefined} muted={!error}>
      {error === 'write' ? a.writeError : error === 'read' ? a.readError : saving ? a.saving : a.note}
    </AppText>
  </View>;
}
