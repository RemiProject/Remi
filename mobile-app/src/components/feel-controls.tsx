import { useSyncExternalStore } from 'react';
import { Switch, View } from 'react-native';
import { AppText, uiStyles } from '@/components/ui/core';
import { useLanguage } from '@/providers/language-provider';
import { feedback, feedbackSettings, type FeedbackSettings } from '@/services/feedback';
import { useRemyTheme } from '@/theme/provider';

/** Sounds and haptics, each on its own switch (iOS's own control: people know what it does). */
export function FeelControls() {
  const settings = useSyncExternalStore(feedbackSettings.subscribe, feedbackSettings.get, feedbackSettings.get);
  const { colors } = useRemyTheme(); const { language } = useLanguage(); const ar = language === 'ar';
  const rows: { key: keyof FeedbackSettings; label: string; note: string }[] = [
    { key: 'sounds', label: ar ? 'الأصوات' : 'Sounds', note: ar ? 'نغمات خفيفة عند الإضافة والحفظ. تتبع زر الصامت.' : 'Soft tones when you add, check off or save. Follows the silent switch.' },
    { key: 'haptics', label: ar ? 'الاهتزاز' : 'Haptics', note: ar ? 'لمسة خفيفة مع كل إجراء.' : 'A light tap under your finger for each action.' },
  ];
  return <View style={uiStyles.stack}>
    <AppText variant="heading">{ar ? 'الإحساس' : 'Feel'}</AppText>
    {rows.map(row => <View key={row.key} style={[uiStyles.row, { justifyContent: 'space-between' }]}>
      <View style={uiStyles.grow}><AppText variant="label">{row.label}</AppText><AppText variant="caption" muted>{row.note}</AppText></View>
      <Switch value={settings[row.key]} accessibilityLabel={row.label} trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
        onValueChange={value => { feedbackSettings.set({ [row.key]: value }); if (value) (row.key === 'sounds' ? feedback.tick : feedback.select)(); }} />
    </View>)}
  </View>;
}
