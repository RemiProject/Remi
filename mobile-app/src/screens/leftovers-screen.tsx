import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { AppText, Button, Card, Chip, SectionHeader, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { isCalendarDate, localDateKey } from '@/domain/inventory';
import { intakeRequest, leftoverFields, newIntakeId, type Leftover } from '@/services/intake-api';
import { IntakeShell, intakeError } from './intake-shell';
export default function LeftoversScreen() {
  const { user } = useAuth(); const { language } = useLanguage();
  return <IntakeShell title={language === 'ar' ? 'بقايا الوجبات' : 'Leftovers'}><LeftoversBody key={user?.id} /></IntakeShell>;
}
function LeftoversBody() {
  const { language } = useLanguage(); const ar = language === 'ar';
  const [items, setItems] = useState<Leftover[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [history, setHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [portions, setPortions] = useState('1');
  const [cookedOn, setCookedOn] = useState(localDateKey);
  const [useBy, setUseBy] = useState('');
  const [storage, setStorage] = useState('FRIDGE');
  const [notes, setNotes] = useState('');
  const [id, setId] = useState(newIntakeId);
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const lockedDraft = useRef(false);
  useEffect(() => {
    let active = true;
    intakeRequest<{ cookbookLeftovers: Leftover[] }>(`query HouseholdLeftovers { cookbookLeftovers { ${leftoverFields} } }`).then(data => { if (active) setItems(data.cookbookLeftovers); }).catch(failure => { if (active) setError(intakeError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [generation]);
  const reload = async () => {
    const data = await intakeRequest<{ cookbookLeftovers: Leftover[] }>(`query HouseholdLeftovers { cookbookLeftovers { ${leftoverFields} } }`);
    setItems(data.cookbookLeftovers);
  };
  const run = async (work: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (failure) { setError(intakeError(failure)); }
    finally { guard.current = false; setBusy(false); }
  };
  const save = () => run(async () => {
    if (!name.trim() || !/^\d+$/.test(portions) || Number(portions) < 1 || Number(portions) > 100 || !isCalendarDate(cookedOn) || (useBy && (!isCalendarDate(useBy) || useBy < cookedOn))) {
      setError(ar ? 'أدخل اسماً و١–١٠٠ حصص وتواريخ صحيحة. لا يمكن أن يسبق التذكير يوم الطهي.' : 'Enter a name, 1–100 portions and valid dates. The reminder cannot precede cooking.'); return;
    }
    lockedDraft.current = true;
    await intakeRequest(`mutation SaveLeftovers($input: SaveCookbookLeftoverInput!) { saveCookbookLeftover(input: $input) { ${leftoverFields} } }`, { input: { id, name: name.trim(), portions: Number(portions), cookedOn, useBy: useBy || null, storage, notes } });
    setEditing(false); lockedDraft.current = false; setId(newIntakeId()); setName(''); setPortions('1'); setUseBy(''); setNotes('');
    setNotice(ar ? 'حُفظت بقايا الوجبة للأسرة.' : 'Leftovers saved for your household.');
    await reload();
  });
  const update = (item: Leftover, status: 'STORED' | 'EATEN' | 'DISCARDED') => run(async () => {
    await intakeRequest(`mutation UpdateLeftovers($id: ID!, $status: String!) { setCookbookLeftoverStatus(id: $id, status: $status) { ${leftoverFields} } }`, { id: item.id, status });
    await reload();
  });
  const changed = () => { if (lockedDraft.current) { setId(newIntakeId()); lockedDraft.current = false; } };
  const visible = items.filter(item => history ? item.status !== 'STORED' : item.status === 'STORED');
  return <>
    <AppText muted>{ar ? 'سجّل الوجبات المطهية ومكان تخزينها. التواريخ تذكيرات تختارها أنت وليست ضماناً لسلامة الطعام.' : 'Track cooked meals and their storage. Dates are reminders you choose, not a food-safety guarantee.'}</AppText>
    <View style={uiStyles.wrap}><Chip label={ar ? 'المحفوظة' : 'Stored'} selected={!history} onPress={() => setHistory(false)} /><Chip label={ar ? 'السجل' : 'History'} selected={history} onPress={() => setHistory(true)} /><Button label={ar ? 'إضافة بقايا وجبة' : 'Add leftovers'} disabled={busy} onPress={() => setEditing(true)} /></View>
    {loading && <AppText>{ar ? 'جارٍ التحميل…' : 'Loading…'}</AppText>}
    {error !== '' && <Card><AppText accessibilityRole="alert">{error}</AppText><Button label={ar ? 'إعادة التحميل' : 'Reload'} disabled={busy} onPress={() => { setLoading(true); setError(''); setGeneration(value => value + 1); }} /></Card>}
    {notice !== '' && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    {editing && <Card><SectionHeader title={ar ? 'وجبة مطهية' : 'Cooked meal'} />
      <FormField label={ar ? 'اسم الوجبة' : 'Meal name'} value={name} maxLength={100} editable={!busy} onChangeText={value => { changed(); setName(value); }} />
      <FormField label={ar ? 'عدد الحصص' : 'Portions'} value={portions} keyboardType="number-pad" editable={!busy} onChangeText={value => { changed(); setPortions(value); }} />
      <FormField label={ar ? 'يوم الطهي' : 'Cooked on'} value={cookedOn} placeholder="YYYY-MM-DD" editable={!busy} onChangeText={value => { changed(); setCookedOn(value); }} />
      <FormField label={ar ? 'تاريخ التذكير الاختياري' : 'Optional reminder date'} value={useBy} placeholder="YYYY-MM-DD" editable={!busy} onChangeText={value => { changed(); setUseBy(value); }} />
      <View style={uiStyles.wrap}><Chip label={ar ? 'الثلاجة' : 'Fridge'} selected={storage === 'FRIDGE'} disabled={busy} onPress={() => { changed(); setStorage('FRIDGE'); }} /><Chip label={ar ? 'الفريزر' : 'Freezer'} selected={storage === 'FREEZER'} disabled={busy} onPress={() => { changed(); setStorage('FREEZER'); }} /></View>
      <FormField label={ar ? 'ملاحظات' : 'Notes'} value={notes} maxLength={1000} multiline editable={!busy} onChangeText={value => { changed(); setNotes(value); }} />
      <Button label={busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ للأسرة' : 'Save for household')} disabled={busy} onPress={() => { void save(); }} /><Button label={ar ? 'إغلاق المسودة' : 'Close draft'} variant="text" disabled={busy} onPress={() => setEditing(false)} />
    </Card>}
    {!loading && !visible.length && <AppText muted>{history ? (ar ? 'لا يوجد سجل بعد.' : 'No history yet.') : (ar ? 'لا توجد بقايا وجبات مسجلة.' : 'No leftovers recorded yet.')}</AppText>}
    {visible.map(item => <Card key={item.id}><AppText variant="heading">{item.name}</AppText><AppText>{item.portions} {ar ? 'حصص' : 'portions'} · {item.storage === 'FREEZER' ? (ar ? 'الفريزر' : 'Freezer') : (ar ? 'الثلاجة' : 'Fridge')}</AppText><AppText variant="caption" muted>{ar ? 'طُهيت في' : 'Cooked'} {item.cookedOn}{item.useBy ? ` · ${ar ? 'تذكير' : 'Reminder'} ${item.useBy}` : ''}</AppText>
      {item.notes !== '' && <AppText>{item.notes}</AppText>}
      {item.status === 'STORED' ? <View style={uiStyles.wrap}><Button label={ar ? 'تم تناولها' : 'Mark eaten'} disabled={busy} onPress={() => { void update(item, 'EATEN'); }} /><Button label={ar ? 'تم التخلص منها' : 'Mark discarded'} variant="dangerText" disabled={busy} onPress={() => { void update(item, 'DISCARDED'); }} /></View> : <><AppText muted>{item.status === 'EATEN' ? (ar ? 'تم تناولها' : 'Eaten') : (ar ? 'تم التخلص منها' : 'Discarded')}</AppText><Button label={ar ? 'تراجع — ما زالت محفوظة' : 'Undo · still stored'} variant="text" disabled={busy} onPress={() => { void update(item, 'STORED'); }} /></>}
    </Card>)}
    <AppText variant="caption" muted>{ar ? 'هذا سجل مستقل للوجبات المطهية؛ لا يغيّر كميات المكونات أو سجل التغذية.' : 'This cooked-meal tracker is separate from ingredient stock and does not alter nutrition logs.'}</AppText>
    <Button label={ar ? 'دليل تخزين الطعام من FoodSafety.gov' : 'FoodSafety.gov storage guidance'} variant="text" onPress={() => { void Linking.openURL('https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts').catch(failure => setError(intakeError(failure))); }} />
  </>;
}
