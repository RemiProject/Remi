import { BackendStorageLocation } from '@/domain/backend-inventory';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Chip, uiStyles } from './ui/core';
import { FormField } from './ui/form-field';
import { useLanguage } from '@/providers/language-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import type { InventoryReadItem } from '@/domain/backend-inventory-read-model';
import { kitchenRequest } from '@/services/kitchen-api';
import { inventoryEndOfDay } from '@/domain/inventory-day';
import { useAction, Feedback } from '@/screens/connected-ui';
import { getAuth } from '@/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveActiveHousehold } from '@/services/active-household-service';
import { isCalendarDate } from '@/domain/inventory';
const locations = [BackendStorageLocation.FRIDGE, BackendStorageLocation.FREEZER, BackendStorageLocation.PANTRY, BackendStorageLocation.COUNTER, BackendStorageLocation.OTHER];
export function InventoryMetadataEditor({ item }: { item: InventoryReadItem }) {
  const { language } = useLanguage(); const ar = language === 'ar'; const c = (en: string, arabic: string) => ar ? arabic : en;
  const kitchen = useBackendKitchen(); const action = useAction(); const [open,setOpen] = useState(false);
  const [storage,setStorage] = useState(item.backendStorageLocation); const [date,setDate] = useState(item.expirationDate ?? '');
  const save = async () => {
    if (date && !isCalendarDate(date)) throw new Error(c('Enter a valid YYYY-MM-DD date, or leave it empty.', 'أدخل تاريخًا صالحًا أو اتركه فارغًا.'));
    const household = await resolveActiveHousehold(getAuth(),AsyncStorage);
    await kitchenRequest('mutation EditMetadata($input: InventoryMetadataInput!) { updateInventoryMetadata(input: $input) { id version } }', { input: { inventoryItemId: item.id, expectedVersion: item.version, storageLocation: storage, estimatedExpiryAt: date ? inventoryEndOfDay(date, household.timezone) : null } });
    await kitchen.refreshStock(item.id); setOpen(false);
  };
  return <><Button label={c('Edit storage & date', 'تعديل التخزين والتاريخ')} variant="secondary" onPress={() => setOpen(!open)} />{open && <Card><AppText variant="heading">{c('Food details', 'تفاصيل الطعام')}</AppText><AppText muted>{c('The food name comes from the shared catalog. Stock amounts are adjusted separately.', 'الاسم من دليل الطعام المشترك. تُعدّل الكمية بشكل منفصل.')}</AppText><View style={uiStyles.wrap}>{locations.map((value,index) => <Chip key={value} label={ar ? ['الثلاجة','الفريزر','الخزانة','سطح العمل','آخر'][index] : value.toLowerCase()} selected={storage === value} disabled={action.busy} onPress={() => setStorage(value)} />)}</View><FormField label={c('Expiry date (optional)', 'تاريخ الانتهاء (اختياري)')} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCorrect={false} inputDirection="ltr" /><Feedback message={action.message} /><Button label={c('Save details', 'حفظ التفاصيل')} disabled={action.busy} onPress={() => { void action.run(save); }} /><Button label={c('Cancel', 'إلغاء')} variant="text" disabled={action.busy} onPress={() => setOpen(false)} /></Card>}</>;
}
