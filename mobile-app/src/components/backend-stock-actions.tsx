import { useEffect, useState, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText, Button, Card, Chip, ScreenDirectionProvider, uiStyles } from '@/components/ui/core';
import { FieldGroup, FormField } from '@/components/ui/form-field';
import type { InventoryReadItem } from '@/domain/backend-inventory-read-model';
import { toMobileUnit } from '@/domain/inventory-enum-adapters';
import { unitOptions } from '@/domain/inventory';
import { stockActionMessages } from '@/i18n/backend-stock-actions';
import { backendKitchenMessages } from '@/i18n/backend-kitchen';
import { homeUnitLabels } from '@/i18n/home';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { useLanguage } from '@/providers/language-provider';
import { getAuth } from '@/services/auth';
import { isSignedOutError } from '@/services/auth-validation';
import { BackendStockActionsStore } from '@/services/backend-stock-actions';
import { backendUnitLabel, displayInventoryQuantity, inventoryNumberLabel } from '@/utils/backend-kitchen-view';
import { useRemyTheme } from '@/theme/provider';
import { spacing } from '@/theme/tokens';

export function BackendStockActions({ item }: { item: InventoryReadItem }) {
  const { language } = useLanguage();
  const t = stockActionMessages[language];
  const { colors } = useRemyTheme();
  const { refreshStock, showUpdated } = useBackendKitchen();
  const [store] = useState(() => new BackendStockActionsStore(getAuth(), AsyncStorage, item,
    () => refreshStock(item.id), zero => { showUpdated(); if (zero) router.replace('/kitchen'); }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const busy = state.saving, locked = busy || state.refreshPending;
  const error = state.error as { code?: string; codes?: string[]; cause?: unknown } | null;
  const cause = (error?.cause ?? error) as typeof error;
  const codes = cause?.codes ?? [];
  const message = isSignedOutError(cause) ? t.signedOut : error?.code === 'STALE_CONTEXT' ? t.stale
    : error?.code === 'READ_ONLY' ? backendKitchenMessages[language].readOnly
      : codes.some(code => ['UNIT_NOT_CONVERTIBLE', 'UNIT_CONVERSION_UNAVAILABLE'].includes(code)) ? t.unitMismatch
        : codes.includes('INVALID_QUANTITY') ? t.conversionQuantity : codes.includes('FORBIDDEN') ? t.forbidden
          : codes.includes('EMAIL_NOT_VERIFIED') ? t.verify : state.refreshPending ? t.refreshError : t.error;
  const available = state.insufficient;
  const availableUnit = available ? toMobileUnit(available.unit) : null;
  const unitLabel = available && availableUnit
    ? availableUnit.supported ? homeUnitLabels[language][availableUnit.value] : backendUnitLabel({ ...item, unitId: null, backendUnit: available.unit }, language) : '';
  return <>
    {(['used', 'discard', 'fix', 'mistake'] as const).map(action => <View key={action} style={{ gap: spacing.xs }}>
      <Button label={t[action]} variant={action === 'mistake' ? 'dangerText' : 'secondary'} disabled={item.readOnly || locked} onPress={() => store.open(action, item)} />
      {(action === 'used' || action === 'discard') && <AppText variant="caption" muted>{t.fefo}</AppText>}
    </View>)}
    <ScreenDirectionProvider value={language === 'ar'}><Modal visible={state.action !== null} transparent animationType="fade" onRequestClose={store.cancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.overlay }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}>
        <Card accessibilityViewIsModal style={{ maxWidth: 480, width: '100%', alignSelf: 'center', backgroundColor: colors.modalSurface, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <AppText variant="heading" accessibilityRole="header">{state.action === 'mistake' ? t.confirmTitle : state.action ? t[state.action] : ''}</AppText>
          {state.action === 'mistake' ? <AppText>{t.confirmBody}</AppText> : <>
            <FormField label={state.action === 'fix' ? t.total : t.amount} value={state.input} inputDirection="ltr" editable={!locked} keyboardType="decimal-pad" onChangeText={value => store.change('input', value)} error={state.validation ? state.action === 'fix' ? t.balance : t.quantity : undefined} />
            {state.action === 'fix' ? <AppText>{backendUnitLabel(item, language)}</AppText> : <FieldGroup label={t.unit}><View style={uiStyles.wrap}>
              {unitOptions.filter(unit => unit.id !== 'packs').map(unit => <Chip key={unit.id} label={homeUnitLabels[language][unit.id]} selected={state.unit === unit.id} disabled={locked} onPress={() => store.change('unit', unit.id)} />)}
            </View></FieldGroup>}
          </>}
          {(state.action === 'used' || state.action === 'discard') && <AppText variant="caption" muted>{t.fefo}</AppText>}
          {available && <AppText accessibilityRole="alert" dir={language === 'ar' ? 'rtl' : undefined} style={{ color: colors.errorText }}>{t.insufficient(language === 'ar' ? `${inventoryNumberLabel(displayInventoryQuantity(available.available), language)} ${unitLabel}` : `\u2066${displayInventoryQuantity(available.available)} ${unitLabel}\u2069`)}</AppText>}
          {state.error !== null && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{message}</AppText>}
          {state.unchanged && <AppText accessibilityLiveRegion="polite">{t.unchanged}</AppText>}
          <Button label={busy ? t.saving : state.refreshPending ? t.retry : state.action === 'mistake' ? t.confirm : t.save} variant={state.action === 'mistake' && !state.refreshPending ? 'destructive' : 'primary'} disabled={busy || item.readOnly} onPress={() => { void store.submit(state.action === 'mistake'); }} />
          <Button label={t.cancel} variant="text" disabled={locked} onPress={store.cancel} />
        </Card>
      </ScrollView></SafeAreaView>
    </Modal></ScreenDirectionProvider>
  </>;
}
