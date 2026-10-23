import { router } from 'expo-router';
import { View } from 'react-native';
import { type InventoryItem } from '@/domain/inventory';
import { useToday } from '@/providers/inventory-provider';
import { ActionRow } from './ui/core';
import { ExpirationLabel } from './expiration-label';
import { useLanguage } from '@/providers/language-provider';
import { inventoryExpirationLabel, inventoryMessages } from '@/i18n/inventory';
import { homeUnitLabels } from '@/i18n/home';
import { ManagedFoodPhoto } from './managed-food-photo';
import { Icon, type IconName } from './ui/icon';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';

const categoryIcons: Record<InventoryItem['categoryId'], IconName> = { produce: 'food', dairy: 'kitchen', protein: 'recipe', grains: 'pantry', other: 'shopping' };

// Kept named FoodCard for existing imports; presentation is now a compact inventory row.
export function FoodCard({ item, showStorage = true, divider = false }: { item: InventoryItem; compact?: boolean; showStorage?: boolean; divider?: boolean }) {
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = inventoryMessages[language];
  const expiry = inventoryExpirationLabel(item, useToday(), language);
  const quantity = `${item.quantity.toLocaleString(language)} ${homeUnitLabels[language][item.unitId]}`;
  return <ActionRow title={item.name} divider={divider} rtl={language === 'ar'}
    leading={<View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 52, height: 58, backgroundColor: colors.surfaceMuted, borderRadius: radii.md, padding: item.photoRef ? 0 : spacing.sm, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>{item.photoRef ? <View style={{ width: 52 }}><ManagedFoodPhoto photoRef={item.photoRef} height={58} /></View> : <Icon name={categoryIcons[item.categoryId]} size={28} color={colors.primary} />}</View>}
    subtitle={`${quantity}${showStorage ? ` · ${t[item.storageId]}` : ''}`}
    accessibilityLabel={`${item.name}, ${t[item.categoryId]}, ${quantity}, ${t[item.storageId]}. ${expiry}. ${t.view}`}
    onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })}>
    <ExpirationLabel item={item} />
  </ActionRow>;
}
