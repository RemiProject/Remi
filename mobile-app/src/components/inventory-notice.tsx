import { AppText, Button, Card } from './ui/core';
import { ActivityIndicator, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { useInventory } from '@/providers/inventory-provider';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { inventoryMessages } from '@/i18n/inventory';

export function InventoryNotice() {
  const { status, error, pendingWrites, retryRead } = useInventory();
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = inventoryMessages[language];
  const textStyle = { textAlign: language === 'ar' ? 'right' as const : 'left' as const };
  if (status === 'idle' || status === 'loading') return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}><ActivityIndicator color={colors.primary} /><AppText muted style={textStyle} accessibilityLiveRegion="polite">{t.loading}</AppText></View>;
  if (error) return <Card style={{ backgroundColor: colors.errorSurface, borderColor: colors.errorText }}>
    <AppText variant="label" accessibilityRole="alert" style={[textStyle, { color: colors.errorText }]}>{error.operation === 'read' ? t.unavailable : t.notSaved}</AppText>
    <AppText style={[textStyle, { color: colors.errorText }]}>{error.operation === 'read' ? t.readError : t.writeError}</AppText>
    {error.operation === 'read' && <Button label={t.retry} onPress={() => { void retryRead(); }} />}
  </Card>;
  if (pendingWrites) return <AppText variant="caption" muted style={textStyle} accessibilityLiveRegion="polite">{t.saving}</AppText>;
  return null;
}
