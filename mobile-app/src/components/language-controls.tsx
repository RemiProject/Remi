import { View } from 'react-native';
import { AppText, Button, Segmented, uiStyles } from './ui/core';
import { useLanguage } from '@/providers/language-provider';
import { homeMessages } from '@/i18n/home';
import { inventoryMessages } from '@/i18n/inventory';
import { useRemyTheme } from '@/theme/provider';

export function LanguageControls() {
  const { language, ready, saving, error, setLanguage, retry } = useLanguage();
  const { colors } = useRemyTheme();
  const t = inventoryMessages[language];
  return <View style={uiStyles.stack}>
    <Segmented label={t.language} value={language} disabled={!ready || saving} onChange={value => { void setLanguage(value as 'en' | 'ar'); }}
      options={(['en', 'ar'] as const).map(value => ({ key: value, label: value === 'en' ? homeMessages[language].english : homeMessages[language].arabic }))} />
    {!ready && !error && <AppText variant="caption" muted>{t.preferenceLoading}</AppText>}
    {error && <><AppText accessibilityRole="alert" variant="caption" style={{ color: colors.errorText }}>{t.preferenceError}</AppText>
      <Button label={t.preferenceRetry} variant="text" disabled={saving} onPress={() => { void retry(); }} /></>}
  </View>;
}
