import { useRef, useState } from 'react';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { AppText, Button, Card, EmptyState, PageHeader, Screen, SectionHeader, uiStyles } from '@/components/ui/core';
import { ManagedFoodPhoto } from '@/components/managed-food-photo';
import { ExpirationLabel } from '@/components/expiration-label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InventoryNotice } from '@/components/inventory-notice';
import { useLanguage } from '@/providers/language-provider';
import { foodEntryMessages, localizedInventoryError } from '@/i18n/food-entry';
import { inventoryMessages } from '@/i18n/inventory';
import { homeUnitLabels } from '@/i18n/home';

import { useInventory } from '@/providers/inventory-provider';
import { useRemyTheme } from '@/theme/provider';
import { spacing } from '@/theme/tokens';

export default function FoodDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, status, deleteItem } = useInventory();
  const item = items.find((food) => food.id === id);
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const rtl = language === 'ar';
  const { colors } = useRemyTheme();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const busy = useRef(false);
  const disableRemovePrevention = usePreventRemove(deleting, () => {});
  const remove = async () => {
    if (!item || busy.current) return;
    busy.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteItem(item.id);
      busy.current = false;
      setDeleting(false);
      disableRemovePrevention();
      setConfirming(false);
      router.replace('/kitchen');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Deletion was not saved. Please retry.');
    } finally { busy.current = false; setDeleting(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Stack.Screen options={{ gestureEnabled: !deleting }} />
    <Screen rtl={rtl}>
      <Button label={t.back} icon="back" rtl={rtl} variant="text" disabled={deleting} onPress={() => router.canGoBack() ? router.back() : router.replace('/kitchen')} />
      <InventoryNotice />
      {status === 'ready' && (item ? <>
        <PageHeader title={item.name} subtitle={`${item.quantity.toLocaleString(language)} ${homeUnitLabels[language][item.unitId]}`} />
        {item.photoRef && <ManagedFoodPhoto photoRef={item.photoRef} height={210} />}
        <ExpirationLabel item={item} />
        <Card>
          <DetailRow label={t.storage} value={inventoryMessages[language][item.storageId]} />
          <DetailRow label={t.category} value={inventoryMessages[language][item.categoryId]} />
          <DetailRow label={t.purchased} value={item.purchaseDate ?? t.notEntered} />
          <DetailRow label={t.expires} value={item.expirationDate ?? t.notEntered} />
        </Card>
        {item.notes && <View style={{ gap: spacing.sm }}><SectionHeader title={t.notes} /><AppText>{item.notes}</AppText></View>}
        <AppText variant="caption" muted>{t.safety}</AppText>
        <Button label={t.edit} icon="manual" disabled={deleting} onPress={() => router.push({ pathname: '/food/edit/[id]', params: { id: item.id } })} />
        <Button label={t.delete} variant="dangerText" disabled={deleting} onPress={() => { setDeleteError(''); setConfirming(true); }} />
      </> : <EmptyState title={t.missing} description={t.missingBody} action={t.browse} onPress={() => router.replace('/kitchen')} />)}
    </Screen>
    <ConfirmDialog visible={confirming} name={item?.name ?? t.thisFood} busy={deleting} error={deleteError ? localizedInventoryError(deleteError, language) : undefined} onCancel={() => setConfirming(false)} onConfirm={() => { void remove(); }} />
  </SafeAreaView>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={[uiStyles.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}>
    <AppText variant="caption" muted style={{ minWidth: 90 }}>{label}</AppText><AppText variant="label" style={{ flexShrink: 1 }}>{value}</AppText>
  </View>;
}
