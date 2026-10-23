import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, SearchField, SectionHeader, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { emptyShoppingDraft, shoppingCategories, shoppingDraft, shoppingView, validateShopping, type ShoppingItem, type ShoppingDraft } from '@/domain/shopping';
import { shoppingMessages } from '@/i18n/shopping';
import { useShopping } from '@/providers/shopping-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';

export default function ShoppingScreen() {
  const shopping = useShopping();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = shoppingMessages[language];
  const rtl = language === 'ar';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'toBuy' | 'purchased'>('all');
  const [editor, setEditor] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<ShoppingDraft>({ ...emptyShoppingDraft });
  const [errors, setErrors] = useState<ReturnType<typeof validateShopping>['errors']>({});
  const [confirmation, setConfirmation] = useState<{ id: string; name: string } | 'clear' | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [feedback, setFeedback] = useState<'added' | 'updated' | 'removed' | 'cleared' | 'changed' | null>(null);
  const visible = shoppingView(shopping.items, query, filter);
  const purchased = shopping.items.filter((item) => item.purchased).length;
  const open = (item?: ShoppingItem) => { Keyboard.dismiss(); setDraft(item ? shoppingDraft(item) : { ...emptyShoppingDraft }); setErrors({}); setEditor(item?.id ?? null); };
  const close = () => { if (!guard.current) { setEditor(undefined); setConfirmation(null); } };
  const perform = async (operation: () => Promise<void>, message: NonNullable<typeof feedback>, dismiss = false) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setFeedback(null); Keyboard.dismiss();
    try { await operation(); setFeedback(message); if (dismiss) { setEditor(undefined); setConfirmation(null); } }
    catch { /* Store retains data and exposes localized retry feedback. */ }
    finally { guard.current = false; setBusy(false); }
  };
  const save = () => {
    const validation = validateShopping(draft); setErrors(validation.errors);
    if (validation.value) { const input = validation.value; void perform(() => shopping.save(input, editor ?? undefined), editor ? 'updated' : 'added', true); }
  };
  const handleToggle = async (id: string) => {
    if (guard.current) return;
    guard.current = true; setBusy(true); setFeedback(null);
    try { await shopping.toggle(id); setFeedback('changed'); }
    catch { /* Keep the saved status and show the store error. */ }
    finally { guard.current = false; setBusy(false); }
  };
  const change = (field: keyof ShoppingDraft, value: string) => { setDraft((previous) => ({ ...previous, [field]: value })); setErrors((previous) => ({ ...previous, [field]: undefined })); };
  const writeError = shopping.writeError && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t.writeError}</AppText>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl} contentGap={spacing.lg}>
    <PageHeader title={t.title} action={<Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    {shopping.status !== 'ready' ? <Card><AppText accessibilityLiveRegion="polite">{shopping.status === 'error' ? t.readError : t.loading}</AppText>{shopping.status === 'error' && <Button label={t.retry} onPress={() => { void shopping.retry(); }} />}</Card> : <>
      <View style={[uiStyles.row, { flexWrap: 'wrap' }]}><AppText style={{ flex: 1 }}>{(shopping.items.length - purchased).toLocaleString(language)} {t.remaining} · {purchased.toLocaleString(language)} {t.bought}</AppText><Button label={t.add} icon="add" disabled={busy} onPress={() => open()} /></View>
      <SearchField value={query} onChangeText={setQuery} placeholder={t.search} accessibilityLabel={t.search} autoCorrect={false} style={{ textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }} />
      <View style={uiStyles.wrap}>{(['all', 'toBuy', 'purchased'] as const).map((value) => <Chip key={value} label={t[value]} selected={filter === value} onPress={() => setFilter(value)} />)}</View>
      {feedback && <AppText accessibilityLiveRegion="polite" variant="caption">{t[feedback]}</AppText>}{writeError}
      {!shopping.items.length ? <EmptyState title={t.empty} description={t.emptyBody} /> : !visible.length ? <EmptyState title={t.noResults} description={t.noResultsBody} action={t.reset} onPress={() => { setQuery(''); setFilter('all'); }} /> : [undefined, ...shoppingCategories].map((category) => {
        const items = visible.filter((item) => item.category === category);
        return items.length > 0 && <View key={category ?? 'none'} style={{ gap: spacing.sm }}><SectionHeader title={category ? t[category] : t.none} />
          {items.map((item) => <View key={item.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.divider, gap: spacing.xs }}>
            <View style={uiStyles.row}>
              <ShoppingCheckbox item={item} disabled={busy} onToggle={handleToggle} />
              <View style={{ flex: 1, gap: spacing.xs }}><AppText variant="label" style={{ textDecorationLine: item.purchased ? 'line-through' : 'none', color: item.purchased ? colors.textSecondary : colors.text }}>{item.name}</AppText>{(item.quantity !== undefined || item.unit) && <AppText variant="caption" muted>{[item.quantity?.toLocaleString(language), item.unit].filter(Boolean).join(' ')}</AppText>}</View>
            </View>
            <View style={uiStyles.wrap}><Button label={t.edit} icon="manual" variant="text" disabled={busy} onPress={() => open(item)} /><Button label={t.remove} variant="dangerText" disabled={busy} onPress={() => setConfirmation({ id: item.id, name: item.name })} /></View>
          </View>)}
        </View>;
      })}
      {purchased > 0 && <Button label={t.clear} variant="dangerText" disabled={busy} onPress={() => setConfirmation('clear')} />}
      <AppText variant="caption" muted>{t.local}</AppText>
    </>}
  </Screen>
    <Modal visible={editor !== undefined || confirmation !== null} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><Screen rtl={rtl} contentGap={spacing.lg}>
        <PageHeader title={confirmation ? confirmation === 'clear' ? t.confirmClear : t.confirmDelete : editor ? t.edit : t.add} action={<Button label={t.cancel} variant="text" disabled={busy} onPress={close} />} />
        {writeError}
        {confirmation ? <><AppText>{confirmation === 'clear' ? t.irreversible : confirmation.name}</AppText>{confirmation !== 'clear' && <AppText muted>{t.irreversible}</AppText>}<Button label={busy ? t.saving : t.confirm} variant="destructive" disabled={busy} onPress={() => { void perform(() => confirmation === 'clear' ? shopping.clearPurchased() : shopping.remove(confirmation.id), confirmation === 'clear' ? 'cleared' : 'removed', true); }} /></> : <>
          <FormField label={t.name} value={draft.name} onChangeText={(value) => change('name', value)} maxLength={101} editable={!busy} error={errors.name ? t[errors.name] : undefined} />
          <FormField label={t.quantity} value={draft.quantity} onChangeText={(value) => change('quantity', value)} keyboardType="decimal-pad" inputDirection="ltr" editable={!busy} error={errors.quantity ? t[errors.quantity] : undefined} />
          <FormField label={t.unit} value={draft.unit} onChangeText={(value) => change('unit', value)} maxLength={25} editable={!busy} error={errors.unit ? t[errors.unit] : undefined} />
          <SectionHeader title={t.category} /><View style={uiStyles.wrap}><Chip label={t.none} selected={!draft.category} disabled={busy} onPress={() => change('category', '')} />{shoppingCategories.map((category) => <Chip key={category} label={t[category]} selected={draft.category === category} disabled={busy} onPress={() => change('category', category)} />)}</View>
          {errors.category && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{t[errors.category]}</AppText>}
          <Button label={busy ? t.saving : t.save} disabled={busy || shopping.status !== 'ready'} onPress={save} />
        </>}
      </Screen></KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function ShoppingCheckbox({ item, disabled: busy, onToggle }: { item: ShoppingItem; disabled: boolean; onToggle: (id: string) => Promise<void> }) {
  const { language } = useLanguage();
  const t = shoppingMessages[language];
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityHint={item.purchased ? t.unmark : t.mark} accessibilityState={{ checked: item.purchased, disabled: busy }} disabled={busy} onPress={() => { void onToggle(item.id); }} style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: pressed ? colors.pressedSurface : colors.surfaceMuted })}>
                <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: colors.primary, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: item.purchased ? colors.primary : colors.background }}>{item.purchased && <Icon name="check" size={16} color={colors.onPrimary} />}</View>
              </Pressable>;
}
