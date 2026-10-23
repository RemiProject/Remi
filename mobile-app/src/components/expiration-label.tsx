import { expirationStatus, type InventoryItem } from '@/domain/inventory';
import { useToday } from '@/providers/inventory-provider';
import { useRemyTheme } from '@/theme/provider';
import { AppText } from './ui/core';
import { useLanguage } from '@/providers/language-provider';
import { inventoryExpirationLabel } from '@/i18n/inventory';

export function ExpirationLabel({ item }: { item: InventoryItem }) {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const today = useToday();
  const status = expirationStatus(item, today);
  const soon = status.days !== null && status.days >= 0 && status.days <= 3;
  const label = inventoryExpirationLabel(item, today, language);
  return <AppText variant="caption" style={{ textAlign: language === 'ar' ? 'right' : 'left', writingDirection: language === 'ar' ? 'rtl' : 'ltr', color: status.kind === 'expired' ? colors.errorText : soon ? colors.warningText : colors.textSubtle }}>{label}</AppText>;
}
