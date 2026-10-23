import { View } from 'react-native';
import { AppText, Chip, uiStyles } from '@/components/ui/core';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { appMessages } from '@/i18n/app';
import { appearanceMessages } from '@/i18n/appearance';

export function AppearanceControls() {
  const { appearance, setAppearance, saving, error, colors } = useRemyTheme();
  const { language } = useLanguage(); const t = appMessages[language]; const a = appearanceMessages[language];
  return <View style={uiStyles.stack}>
    <AppText variant="heading">{t.appearance}</AppText>
    <View style={uiStyles.wrap}>{(['system', 'light', 'dark'] as const).map(value => <Chip key={value} label={t[value]} selected={appearance === value} onPress={() => setAppearance(value)} />)}</View>
    <AppText variant="caption" accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined} style={error ? { color: colors.errorText } : undefined} muted={!error}>
      {error === 'write' ? a.writeError : error === 'read' ? a.readError : saving ? a.saving : a.note}
    </AppText>
  </View>;
}
