import { Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, ScreenDirectionProvider } from './core';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { foodEntryMessages } from '@/i18n/food-entry';
import { spacing } from '@/theme/tokens';

export function ConfirmDialog({ visible, name, busy, error, onCancel, onConfirm }: {
  visible: boolean; name: string; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const rtl = language === 'ar';
  const { colors } = useRemyTheme();
  return <ScreenDirectionProvider value={rtl}><Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.overlay }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}>
        <Card accessibilityViewIsModal style={{ maxWidth: 480, width: '100%', alignSelf: 'center', padding: spacing.xl, backgroundColor: colors.modalSurface, direction: rtl ? 'rtl' : 'ltr' }}>
          <AppText variant="heading" accessibilityRole="header">{t.deleteTitle}</AppText>
          <AppText>{name}</AppText>
          <AppText muted>{t.deleteBody}</AppText>
          {error && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{error}</AppText>}
          <Button label={busy ? t.deleting : t.delete} variant="destructive" disabled={busy} onPress={onConfirm} />
          <Button label={t.keep} variant="secondary" disabled={busy} onPress={onCancel} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  </Modal></ScreenDirectionProvider>;
}