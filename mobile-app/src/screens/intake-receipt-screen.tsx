import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { router } from 'expo-router';
import { AppText, Badge, Button, Card, Chip, SectionHeader, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { FoodPhotoField } from '@/components/food-photo-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { parseReceipt, type ReceiptParse } from '@/domain/receipt-parser';
import { amountValid, buildReview, groupByCategory, probableExpiry, RECEIPT_UNITS, submission, withFood, type ReceiptFoodOption, type ReviewLine, type Storage } from '@/domain/receipt-review';
import { matchReceiptItems, receiveReceipt } from '@/services/receipt-api';
import { scanReceipt } from '@/services/receipt-ocr';
import { uploadKitchenImage } from '@/services/intake-media';
import { receiptReviewCopy } from '@/i18n/receipt-review';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';
import LocalReceiptScreen from './receipt-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
import { IntakeShell, intakeError } from './intake-shell';

type Language = 'en' | 'ar';
// The app edits these three; room temperature is Pantry.
const STORAGES: Storage[] = ['FRIDGE', 'FREEZER', 'PANTRY'];
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const foodName = (food: ReceiptFoodOption, language: Language) => language === 'ar' && food.arabicName ? food.arabicName : food.name.charAt(0).toUpperCase() + food.name.slice(1);

export default function IntakeReceiptScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  if (!isBackendInventoryEnabled()) return <LocalReceiptScreen />;
  return <IntakeShell title={receiptReviewCopy[language].title}><ReceiptBody key={user?.id} /></IntakeShell>;
}

type Phase = { name: 'capture' } | { name: 'review'; parse: ReceiptParse } | { name: 'done'; added: number; replayed: boolean };
type Busy = '' | 'reading' | 'matching' | 'adding' | 'saving';

function ReceiptBody() {
  const { language } = useLanguage();
  const t = receiptReviewCopy[language];
  const kitchen = useBackendKitchen();
  const [phase, setPhase] = useState<Phase>({ name: 'capture' });
  const [photoRef, setPhotoRef] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState('');
  const [showTyped, setShowTyped] = useState(false);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [busy, setBusy] = useState<Busy>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uploadedRef, setUploadedRef] = useState('');
  const [addedSoFar, setAddedSoFar] = useState(0);
  // One key per reviewed receipt: retrying a failed add can't add the same foods twice.
  const key = useRef(newKey());
  const guard = useRef(false);

  const run = async (state: Busy, work: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true; setBusy(state); setError(''); setNotice('');
    try { await work(); } catch (failure) { setError(state === 'adding' ? t.saveFailed : state === 'saving' ? intakeError(failure) : t.matchFailed); }
    finally { guard.current = false; setBusy(''); }
  };
  const review = async (printed: string[]) => {
    const parse = parseReceipt(printed);
    if (!parse.items.length) { setNotice(t.noFood); setShowTyped(true); setTyped(printed.join('\n')); return; }
    setBusy('matching');
    const matches = await matchReceiptItems(parse.items.map(item => item.name));
    setLines(buildReview(parse, matches)); key.current = newKey();
    setPhase({ name: 'review', parse });
  };
  const read = () => run('reading', async () => {
    if (!photoRef) return;
    const result = await scanReceipt(photoRef);
    if (result.status === 'success') return review(result.rows);
    setShowTyped(true); setNotice(result.status === 'unavailable' ? t.unavailable : t.unreadable);
  });
  const add = () => run('adding', async () => {
    if (phase.name !== 'review') return;
    const { items, keys, missing } = submission(lines);
    if (!items.length) { setError(t.missing(missing.length)); return; }
    const done = await receiveReceipt({ idempotencyKey: key.current, purchaseDate: phase.parse.date ?? undefined, items });
    try { await kitchen.retry(); } catch { /* The foods were added; Kitchen refreshes when it opens. */ }
    // Foods still waiting for an amount stay on screen; the next add is a new request.
    const rest = lines.filter(line => !keys.includes(line.key));
    if (missing.length) { key.current = newKey(); setLines(rest); setAddedSoFar(count => count + done.added); setNotice(t.addedSome(done.added, missing.length)); return; }
    setPhase({ name: 'done', added: addedSoFar + done.added, replayed: done.replayed });
  });
  const restart = () => { setAddedSoFar(0); setPhase({ name: 'capture' }); setLines([]); setPhotoRef(undefined); setTyped(''); setShowTyped(false); setNotice(''); setError(''); };

  if (phase.name === 'done') return <Card style={{ gap: spacing.md }}>
    <AppText variant="heading" accessibilityLiveRegion="polite">{phase.replayed ? t.alreadyAdded : t.added(phase.added)}</AppText>
    <View style={uiStyles.wrap}><Button label={t.openKitchen} onPress={() => router.replace('/kitchen')} /><Button label={t.another} variant="secondary" onPress={restart} /></View>
  </Card>;

  if (phase.name === 'review') return <ReviewView parse={phase.parse} lines={lines} setLines={setLines} busy={busy !== ''} adding={busy === 'adding'} error={error} notice={notice} language={language} onAdd={() => { void add(); }} onRestart={restart} />;

  const ar = language === 'ar';
  return <>
    <AppText muted>{t.intro}</AppText>
    <FoodPhotoField label={t.photo} note={t.photoNote} photoRef={photoRef} onChange={ref => { setPhotoRef(ref); setNotice(''); setUploadedRef(''); }} disabled={busy !== ''} onBusy={setPicking} />
    <View style={uiStyles.wrap}>
      <Button label={busy === 'reading' ? t.reading : busy === 'matching' ? t.matching : t.read} disabled={!photoRef || busy !== '' || picking} onPress={() => { void read(); }} />
      <Button label={uploadedRef === photoRef && photoRef ? (ar ? 'حُفظت الصورة' : 'Image saved') : (ar ? 'حفظ صورة الإيصال' : 'Save receipt image')} variant="secondary" disabled={!photoRef || busy !== '' || picking || uploadedRef === photoRef}
        onPress={() => { void run('saving', async () => { if (photoRef) { await uploadKitchenImage(photoRef, 'RECEIPT'); setUploadedRef(photoRef); setNotice(ar ? 'حُفظت الصورة في أرشيف صور الأسرة.' : 'Saved to your household image archive.'); } }); }} />
    </View>
    {notice !== '' && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    {error !== '' && <AppText accessibilityRole="alert">{error}</AppText>}
    {!showTyped ? <Button label={t.typeInstead} variant="text" onPress={() => setShowTyped(true)} /> : <>
      <FormField label={t.typeLabel} hint={t.typeHint} value={typed} onChangeText={setTyped} multiline editable={busy === ''} />
      <Button label={busy === 'matching' ? t.matching : t.readText} variant="secondary" disabled={!typed.trim() || busy !== ''} onPress={() => { void run('matching', () => review(typed.split(/\r?\n/))); }} />
    </>}
  </>;
}

function ReviewView({ parse, lines, setLines, busy, adding, error, notice, language, onAdd, onRestart }: {
  parse: ReceiptParse; lines: ReviewLine[]; setLines: (update: (lines: ReviewLine[]) => ReviewLine[]) => void;
  busy: boolean; adding: boolean; error: string; notice: string; language: Language; onAdd: () => void; onRestart: () => void;
}) {
  const t = receiptReviewCopy[language];
  const { colors } = useRemyTheme();
  const [showSkipped, setShowSkipped] = useState(false);
  const { groups, unmatched } = useMemo(() => groupByCategory(lines), [lines]);
  const update = (lineKey: string, change: (line: ReviewLine) => ReviewLine) => setLines(all => all.map(line => line.key === lineKey ? change(line) : line));
  const { items: ready, missing } = submission(lines);
  const chosen = ready.length;
  const money = (value: number) => value.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = parse.date ? new Date(`${parse.date}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' }) : t.today;
  const skipped = parse.ignored;
  const category = (code: string, name: string) => (language === 'ar' && t.categories[code]) || name;

  return <>
    <Card style={{ gap: spacing.sm }}>
      {parse.store && <AppText variant="heading">{parse.store}</AppText>}
      <AppText muted>{t.purchased}: {date}</AppText>
      <AppText>{t.found(lines.filter(line => line.food).length)} · {t.skippedCount(skipped.length + unmatched.length)}</AppText>
      {parse.check.status === 'match' && <Badge tone="success" label={t.checkMatch(money(parse.check.printed!))} />}
      {parse.check.status === 'mismatch' && <Badge tone="warning" label={t.checkMismatch(money(parse.check.itemsSum), money(parse.check.printed!))} />}
      <AppText variant="caption" muted>{t.tickHint}</AppText>
      {missing.length > 0 && <AppText variant="caption" style={{ color: colors.warningText }}>{t.needAmount(missing.length)}</AppText>}
      {notice !== '' && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
      <Button label={adding ? t.adding : chosen === 0 && missing.length ? t.enterAmounts : t.addAll(chosen)} disabled={busy || chosen === 0} onPress={onAdd} />
    </Card>

    {groups.map(group => <View key={group.code} style={{ gap: spacing.sm }}>
      <SectionHeader title={category(group.code, group.name)} />
      {group.lines.map(line => <ReviewRow key={line.key} line={line} language={language} disabled={busy} purchaseDay={parse.date ?? todayDay()} onChange={change => update(line.key, change)} />)}
    </View>)}

    {unmatched.length > 0 && <View style={{ gap: spacing.sm }}>
      <SectionHeader title={t.unmatched} />
      <AppText muted>{t.unmatchedHint}</AppText>
      {unmatched.map(line => <ReviewRow key={line.key} line={line} language={language} disabled={busy} purchaseDay={parse.date ?? todayDay()} onChange={change => update(line.key, change)} />)}
    </View>}

    {skipped.length > 0 && <View style={{ gap: spacing.sm }}>
      <Button label={showSkipped ? t.hideSkipped : t.showSkipped(skipped.length)} variant="text" onPress={() => setShowSkipped(value => !value)} />
      {showSkipped && <Card style={{ gap: spacing.sm }}>
        {skipped.map((line, index) => <View key={index} style={[uiStyles.row, { justifyContent: 'space-between', gap: spacing.sm }]}>
          <AppText variant="caption" style={uiStyles.grow} numberOfLines={2}>{line.text}</AppText><AppText variant="caption" muted>{t.reasons[line.reason]}</AppText>
        </View>)}
      </Card>}
    </View>}

    {error !== '' && <AppText accessibilityRole="alert">{error}</AppText>}
    <Button label={adding ? t.adding : chosen === 0 && missing.length ? t.enterAmounts : t.addAll(chosen)} disabled={busy || chosen === 0} onPress={onAdd} />
    <Button label={t.retake} variant="text" disabled={busy} onPress={onRestart} />
  </>;
}

function ReviewRow({ line, language, disabled, purchaseDay, onChange }: { line: ReviewLine; language: Language; disabled: boolean; purchaseDay: string; onChange: (change: (line: ReviewLine) => ReviewLine) => void }) {
  const t = receiptReviewCopy[language];
  const { colors } = useRemyTheme();
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const have = line.food && line.match.food?.foodId === line.food.foodId ? line.match.inKitchen : [];
  const missingAmount = line.include && !amountValid(line.amount);
  // Lines that need a decision open by themselves; confident ones stay one line tall.
  const open = line.include && (editing || missingAmount || line.check);
  const amountText = amountValid(line.amount) ? `${Number(line.amount).toLocaleString(language)} ${t.units[line.unit]}` : '';

  return <Card style={{ gap: spacing.sm }}>
    <View style={[uiStyles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
      <View style={[uiStyles.grow, { gap: 2 }]}>
        <AppText variant="label" style={{ color: line.food && !line.include ? colors.textSecondary : colors.text }}>{line.food ? foodName(line.food, language) : line.item.name.charAt(0).toUpperCase() + line.item.name.slice(1)}</AppText>
        {line.food && line.include && !open && <AppText>{[amountText, t.storages[line.storage]].filter(Boolean).join(' · ')}</AppText>}
        <AppText variant="caption" muted numberOfLines={2}>{line.item.raw}</AppText>
      </View>
      {line.food && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: line.include, disabled }} accessibilityLabel={t.include(foodName(line.food, language))} disabled={disabled} hitSlop={10}
        onPress={() => onChange(current => ({ ...current, include: !current.include, check: false }))}
        style={{ width: 32, height: 32, borderRadius: radii.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
          borderColor: line.include ? colors.primary : colors.border, backgroundColor: line.include ? colors.primary : 'transparent' }}>
        {line.include && <Icon name="check" color={colors.onPrimary} size={20} />}
      </Pressable>}
    </View>
    {line.check && <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.warningSurface }}>
      <AppText variant="caption" style={{ color: colors.warningText }}>{t.check}</AppText>
    </View>}
    {line.food && line.include && line.food.keeps && <ExpiryHint line={line} purchaseDay={purchaseDay} language={language} />}
    {line.food && line.include && <AppText variant="caption" muted>{have.length ? t.inKitchen(have.map(stock => `${Number(stock.quantity).toLocaleString(language)} ${t.units[stock.unit as keyof typeof t.units] ?? stock.unit}`).join(' + ')) : t.newFood}</AppText>}

    {open && <>
      <FormField label={t.amount} value={line.amount} keyboardType="decimal-pad" editable={!disabled} onChangeText={value => onChange(current => ({ ...current, amount: value, check: false }))} />
      {missingAmount && <AppText variant="caption" style={{ color: colors.errorText }}>{t.amountMissing}</AppText>}
      <View style={uiStyles.wrap}>{RECEIPT_UNITS.map(unit => <Chip key={unit} label={t.units[unit]} selected={line.unit === unit} disabled={disabled} onPress={() => onChange(current => ({ ...current, unit }))} />)}</View>
      <AppText variant="caption" muted>{t.storage}</AppText>
      <View style={uiStyles.wrap}>{STORAGES.map(storage => <Chip key={storage} label={t.storages[storage]} selected={line.storage === storage} disabled={disabled} onPress={() => onChange(current => ({ ...current, storage }))} />)}</View>
    </>}

    {searching ? <FoodSearch initial={line.item.name} first={line.match} language={language} onPick={food => { onChange(current => withFood(current, food)); setSearching(false); }} onSkip={() => { onChange(current => withFood(current, null)); setSearching(false); }} onClose={() => setSearching(false)} />
      : <View style={uiStyles.wrap}>
        {line.food && line.include && !missingAmount && !line.check && <Button label={editing ? t.done : t.edit} variant="text" disabled={disabled} onPress={() => setEditing(value => !value)} />}
        <Button label={line.food ? t.changeFood : t.chooseFood} variant="text" disabled={disabled} onPress={() => setSearching(true)} />
      </View>}
  </Card>;
}

const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The probable expiry for the storage picked, from USDA FoodKeeper averages; it moves when storage changes. */
function ExpiryHint({ line, purchaseDay, language }: { line: ReviewLine; purchaseDay: string; language: Language }) {
  const t = receiptReviewCopy[language];
  const expiry = probableExpiry(line, purchaseDay);
  const text = expiry === 'ripens' ? t.ripens : expiry === null ? t.noShelfLife
    : t.keepsUntil(new Date(`${expiry.day}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'short' }), expiry.days);
  return <AppText variant="caption" muted>{text}</AppText>;
}

function FoodSearch({ initial, first, language, onPick, onSkip, onClose }: {
  initial: string; first: ReviewLine['match']; language: Language; onPick: (food: ReceiptFoodOption) => void; onSkip: () => void; onClose: () => void;
}) {
  const t = receiptReviewCopy[language];
  const [query, setQuery] = useState(initial);
  const [options, setOptions] = useState<ReceiptFoodOption[]>(() => [first.food, ...first.alternatives].filter((food): food is ReceiptFoodOption => !!food));
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const latest = useRef(0);
  const search = async () => {
    if (!query.trim()) return;
    const request = ++latest.current; // only the newest search may update the list
    setState('loading');
    try {
      const [match] = await matchReceiptItems([query.trim()]);
      if (request !== latest.current) return;
      setOptions([match?.food, ...(match?.alternatives ?? [])].filter((food): food is ReceiptFoodOption => !!food)); setState('idle');
    } catch { if (request === latest.current) setState('error'); }
  };
  return <View style={{ gap: spacing.sm }}>
    <FormField label={t.searchLabel} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => { void search(); }} />
    <Button label={state === 'loading' ? t.searching : t.searchLabel} variant="secondary" disabled={state === 'loading' || !query.trim()} onPress={() => { void search(); }} />
    {state === 'error' && <AppText accessibilityRole="alert">{t.matchFailed}</AppText>}
    {state === 'idle' && options.length === 0 && <AppText muted>{t.noResults}</AppText>}
    <View style={uiStyles.wrap}>{options.map(food => <Chip key={food.foodId} label={foodName(food, language)} selected={false} onPress={() => onPick(food)} />)}</View>
    <View style={uiStyles.wrap}><Button label={t.notFoodSkip} variant="text" onPress={onSkip} /><Button label={t.close} variant="text" onPress={onClose} /></View>
  </View>;
}
