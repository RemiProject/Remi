import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText, Button, Card, Chip, SectionHeader, uiStyles } from '@/components/ui/core';
import { FormField, FieldGroup } from '@/components/ui/form-field';
import { FoodPhotoField } from '@/components/food-photo-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { BackendAddFoodStore, catalogChoiceName } from '@/services/backend-add-food';
import { getAuth } from '@/services/auth';
import { receiptCandidates } from '@/services/receipt-review';
import { scanReceipt } from '@/services/receipt-ocr';
import { uploadKitchenImage } from '@/services/intake-media';
import { storageOptions, unitOptions } from '@/domain/inventory';
import { homeUnitLabels } from '@/i18n/home';
import { inventoryMessages } from '@/i18n/inventory';
import LocalReceiptScreen from './receipt-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
import { IntakeShell, intakeError } from './intake-shell';

export default function IntakeReceiptScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  if (!isBackendInventoryEnabled()) return <LocalReceiptScreen />;
  return <IntakeShell title={language === 'ar' ? 'مراجعة الإيصال' : 'Review a receipt'}><ReceiptBody key={user?.id} /></IntakeShell>;
}
function ReceiptBody() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [photoRef, setPhotoRef] = useState<string>();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<{ line: string; index: number } | null>(null);
  const [added, setAdded] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uploadedRef, setUploadedRef] = useState('');
  const guard = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError('');
    try { await work(); } catch (failure) { setError(intakeError(failure)); }
    finally { guard.current = false; setBusy(false); }
  };
  const scan = () => run(async () => {
    if (!photoRef) return;
    const result = await scanReceipt(photoRef);
    if (result.status === 'success') { setText(result.text); setAdded([]); setSelected(null); setNotice(ar ? 'راجع النص وطابق كل منتج بالكتالوج قبل الحفظ.' : 'Review the text and match each food to the catalog before saving.'); }
    else setNotice(ar ? 'تعذر استخراج النص هنا. يمكنك كتابة أو لصق قائمة المنتجات أدناه.' : 'Text recognition is unavailable or could not read this image. Type or paste the food lines below to continue.');
  });
  const candidates = receiptCandidates(text);
  return <>
    <AppText muted>{ar ? 'لن يُضاف أي شيء تلقائياً. راجع كل منتج والكمية والوحدة قبل إضافته لمطبخك.' : 'Nothing is added automatically. Review each food, quantity and unit before adding it to your kitchen.'}</AppText>
    <FoodPhotoField photoRef={photoRef} onChange={ref => { setPhotoRef(ref); setNotice(''); setUploadedRef(''); }} disabled={busy} onBusy={setPicking} />
    <View style={uiStyles.wrap}><Button label={ar ? 'استخراج النص' : 'Read receipt'} disabled={!photoRef || busy || picking} onPress={() => { void scan(); }} />
      <Button label={uploadedRef === photoRef && photoRef ? (ar ? 'حُفظت الصورة' : 'Image saved') : (ar ? 'حفظ صورة الإيصال' : 'Save receipt image')} variant="secondary" disabled={!photoRef || busy || picking || uploadedRef === photoRef} onPress={() => { void run(async () => { if (photoRef) { await uploadKitchenImage(photoRef, 'RECEIPT'); setUploadedRef(photoRef); setNotice(ar ? 'حُفظت الصورة في أرشيف صور الأسرة.' : 'Saved to your household image archive. Food quantities are reviewed separately below.'); } }); }} />
    </View>
    {notice !== '' && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    {error !== '' && <AppText accessibilityRole="alert">{error}</AppText>}
    <FormField label={ar ? 'النص أو قائمة المنتجات' : 'Receipt text or food list'} value={text} onChangeText={value => { setText(value); setAdded([]); setSelected(null); }} multiline editable={!busy} placeholder={ar ? 'منتج واحد في كل سطر' : 'One food per line'} />
    <SectionHeader title={ar ? 'اختر منتجاً للمراجعة' : 'Choose a line to review'} />
    {!candidates.length && <AppText muted>{ar ? 'أضف أسماء المنتجات في الحقل أعلاه.' : 'Add food names above to start reviewing.'}</AppText>}
    {candidates.map((line, index) => <Card key={`${index}:${line}`}><AppText>{line}</AppText><Button label={added.includes(index) ? (ar ? 'أُضيف — إضافة أخرى' : 'Added · add another') : (ar ? 'مراجعة المنتج' : 'Review food')} variant="secondary" disabled={busy} onPress={() => setSelected({ line, index })} /></Card>)}
    {selected && <ReceiptFoodReview key={`${selected.index}:${selected.line}`} line={selected.line} onSaved={() => { setAdded(values => [...values, selected.index]); setSelected(null); }} onClose={() => setSelected(null)} />}
  </>;
}
function ReceiptFoodReview({ line, onSaved, onClose }: { line: string; onSaved: () => void; onClose: () => void }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const kitchen = useBackendKitchen();
  const [store] = useState(() => new BackendAddFoodStore(getAuth(), AsyncStorage));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const { draft, errors, saving } = state;
  const save = async () => {
    if (guard.current) return;
    guard.current = true;
    try {
      if (!await store.submit()) return;
      // The addition succeeded even if refreshing the list later fails.
      try { await kitchen.retry(); } catch { setNotice(ar ? 'حُفظ المنتج. أعد تحميل المطبخ لرؤيته.' : 'Food saved. Reload Kitchen if it is not visible yet.'); }
      store.assertIdentity(); onSaved();
    } catch (failure) { setNotice(intakeError(failure)); } finally { guard.current = false; }
  };
  return <Card>
    <SectionHeader title={ar ? 'تأكيد المنتج' : 'Confirm food'} /><AppText muted>{line}</AppText>
    <FormField label={ar ? 'البحث في كتالوج الطعام' : 'Search food catalog'} value={draft.search} onChangeText={value => store.change('search', value)} editable={!saving} error={errors.food ? (ar ? 'اختر منتجاً من الكتالوج.' : 'Select a catalog food.') : undefined} />
    {state.searchStatus === 'loading' && <AppText>{ar ? 'جارٍ البحث…' : 'Searching…'}</AppText>}
    {state.searchStatus === 'error' && <Button label={ar ? 'إعادة البحث' : 'Retry search'} onPress={() => { void store.search(); }} />}
    {state.searchStatus === 'ready' && state.results.length === 0 && <AppText>{ar ? 'لا توجد نتائج. جرّب اسماً أبسط.' : 'No matches. Try a simpler food name.'}</AppText>}
    {state.results.map(food => <Button key={food.id} label={catalogChoiceName(food, language)} variant="secondary" disabled={saving} onPress={() => store.select(food)} />)}
    {state.cursor && <Button label={ar ? 'المزيد' : 'More results'} disabled={saving} onPress={() => { void store.search(true); }} />}
    {draft.food && <AppText variant="label">{catalogChoiceName(draft.food, language)}</AppText>}
    <FormField label={ar ? 'الكمية' : 'Quantity'} value={draft.quantity} keyboardType="decimal-pad" onChangeText={value => store.change('quantity', value)} editable={!saving} error={errors.quantity ? (ar ? 'أدخل كمية موجبة.' : 'Enter a positive quantity.') : undefined} />
    <FieldGroup label={ar ? 'الوحدة' : 'Unit'} error={errors.unit ? (ar ? 'اختر الوحدة.' : 'Choose a unit.') : undefined}><View style={uiStyles.wrap}>{unitOptions.filter(unit => unit.id !== 'packs').map(unit => <Chip key={unit.id} label={homeUnitLabels[language][unit.id]} selected={draft.unit === unit.id} disabled={saving} onPress={() => store.change('unit', unit.id)} />)}</View></FieldGroup>
    <FieldGroup label={ar ? 'مكان التخزين' : 'Storage'}><View style={uiStyles.wrap}>{storageOptions.map(storage => <Chip key={storage.id} label={inventoryMessages[language][storage.id]} selected={draft.storage === storage.id} disabled={saving} onPress={() => store.change('storage', storage.id)} />)}</View></FieldGroup>
    <FormField label={ar ? 'تاريخ الانتهاء الاختياري' : 'Optional expiry date'} value={draft.expiryDay} placeholder="YYYY-MM-DD" onChangeText={value => store.change('expiryDay', value)} editable={!saving} error={errors.expiryDay ? (ar ? 'أدخل تاريخاً صحيحاً.' : 'Enter a valid date.') : undefined} />
    {state.error !== null && <AppText accessibilityRole="alert">{ar ? 'تعذر الحفظ. راجع الاتصال وحاول مجدداً؛ لن تتكرر الإضافة عند إعادة المحاولة.' : 'Could not save. Check your connection and retry; retrying this save will not duplicate the addition.'}</AppText>}
    {notice !== '' && <AppText>{notice}</AppText>}
    <Button label={saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'إضافة للمطبخ' : 'Add to kitchen')} disabled={saving} onPress={() => { void save(); }} />
    <Button label={ar ? 'إلغاء المراجعة' : 'Cancel review'} variant="text" disabled={saving} onPress={onClose} />
  </Card>;
}
