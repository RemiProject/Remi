import { useEffect, useRef, useState } from 'react';
import { router, Stack, useNavigation } from 'expo-router';
import { AccessibilityInfo, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Chip, EmptyState, PageHeader, Screen, uiStyles } from '@/components/ui/core';
import { FoodPhotoField } from '@/components/food-photo-field';
import { FieldGroup, FormField } from '@/components/ui/form-field';
import { InventoryNotice } from '@/components/inventory-notice';
import { categoryOptions, storageOptions, unitOptions, emptyDraft, itemToDraft, validateDraft, MAX_NAME_LENGTH, MAX_NOTES_LENGTH, type FieldErrors, type FoodDraft, type InventoryItem } from '@/domain/inventory';
import { useInventory } from '@/providers/inventory-provider';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { foodEntryMessages, localizedFoodErrors, localizedInventoryError } from '@/i18n/food-entry';
import { inventoryMessages } from '@/i18n/inventory';
import { homeUnitLabels } from '@/i18n/home';
import { layout, radii, spacing } from '@/theme/tokens';

export default function FoodFormScreen({ itemId, initialPhotoRef, initialName }: { itemId?: string; initialPhotoRef?: string; initialName?: string }) {
  const inventory = useInventory();
  const item = itemId ? inventory.items.find((entry) => entry.id === itemId) : undefined;
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const rtl = language === 'ar';
  const { colors } = useRemyTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Stack.Screen options={{ gestureEnabled: false }} />
    {inventory.status !== 'ready' ? <Screen rtl={rtl}><Button label={t.back} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/kitchen')} /><InventoryNotice /></Screen> :
      itemId && !item ? <Screen rtl={rtl}><EmptyState title={t.missing} description={t.missingBody} action={t.browse} onPress={() => router.replace('/kitchen')} /></Screen> :
        <FoodForm key={item?.id ?? 'create'} item={item} initialPhotoRef={initialPhotoRef} initialName={initialName} />}
  </SafeAreaView>;
}

function FoodForm({ item, initialPhotoRef, initialName }: { item?: InventoryItem; initialPhotoRef?: string; initialName?: string }) {
  const { createItem, updateItem } = useInventory();
  const { language } = useLanguage();
  const t = foodEntryMessages[language];
  const rtl = language === 'ar';
  const { colors } = useRemyTheme();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<FoodDraft>(() => item ? itemToDraft(item) : { ...emptyDraft, name: initialName ?? '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const [photoRef, setPhotoRef] = useState<string | undefined>(item?.photoRef ?? initialPhotoRef);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(() => Boolean(item?.purchaseDate || item?.expirationDate || item?.notes));
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [recovery, setRecovery] = useState<{ field: keyof FoodDraft } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputs = useRef<Partial<Record<keyof FoodDraft, TextInput | null>>>({});
  const positions = useRef<Partial<Record<keyof FoodDraft | 'optional', number>>>({});
  const recordPosition = (field: keyof FoodDraft | 'optional', event: LayoutChangeEvent) => {
    positions.current[field] = event.nativeEvent.layout.y;
  };
  useEffect(() => {
    if (!recovery) return;
    const frame = requestAnimationFrame(() => {
      const field = recovery.field;
      const optional = field === 'purchaseDate' || field === 'expirationDate' || field === 'notes';
      const y = optional ? (positions.current.optional ?? 0) + (positions.current[field] ?? 0) : positions.current[field] ?? 0;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
      inputs.current[field]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [recovery]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => { if (savingRef.current || photoBusyRef.current) event.preventDefault(); });
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => savingRef.current || photoBusyRef.current);
    return () => { unsubscribe(); subscription.remove(); };
  }, [navigation]);
  const change = (field: keyof FoodDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };
  const displayErrors = localizedFoodErrors(errors, draft, language);
  const submit = async () => {
    if (savingRef.current || photoBusyRef.current) return;
    const validation = validateDraft(draft);
    setErrors(validation.errors);
    setSaveError('');
    if (!validation.value) {
      const first = (['name', 'categoryId', 'quantity', 'unitId', 'storageId', 'purchaseDate', 'expirationDate', 'notes'] as const).find((field) => validation.errors[field]);
      if (validation.errors.purchaseDate || validation.errors.expirationDate || validation.errors.notes) setDetailsOpen(true);
      if (validation.errors.unitId) setUnitsOpen(true);
      if (first) {
        setRecovery({ field: first });
        AccessibilityInfo.announceForAccessibility(localizedFoodErrors(validation.errors, draft, language)[first] ?? t.announce);
      }
      return;
    }
    savingRef.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const input = { ...validation.value, ...(photoRef ? { photoRef } : {}) };
      const saved = item ? await updateItem(item.id, input) : await createItem(input);
      savingRef.current = false;
      setSaving(false);
      if (item && router.canGoBack()) router.back();
      else router.replace({ pathname: '/food/[id]', params: { id: saved.id } });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save. Please retry.');
    } finally { savingRef.current = false; setSaving(false); }
  };
  const requiredLabel = (label: string) => label + ' *';
  const unitLabel = unitOptions.find((option) => option.id === draft.unitId);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
    <Screen rtl={rtl} scrollRef={scrollRef} contentGap={spacing.lg}>
      <PageHeader title={item ? t.edit : t.add} action={<Button label={t.cancel} variant="text" disabled={saving || photoBusy} onPress={() => router.canGoBack() ? router.back() : router.replace('/kitchen')} />} />
      <AppText variant="caption" muted>{t.requiredHint}</AppText>
      <View onLayout={(event) => recordPosition('name', event)}>
        <FormField inputRef={(input) => { inputs.current.name = input; }} label={requiredLabel(t.name)} accessibilityLabel={t.name + ', ' + t.required} value={draft.name} onChangeText={(value) => change('name', value)} editable={!saving} maxLength={MAX_NAME_LENGTH + 1} error={displayErrors.name} placeholder={t.nameExample} />
      </View>
      <View onLayout={(event) => recordPosition('categoryId', event)}>
        <FieldGroup label={requiredLabel(t.category)} error={displayErrors.categoryId}><View style={[uiStyles.wrap, { gap: spacing.xs }]}>{categoryOptions.map((option) => <Chip key={option.id} label={inventoryMessages[language][option.id]} selected={draft.categoryId === option.id} disabled={saving} onPress={() => change('categoryId', option.id)} />)}</View></FieldGroup>
      </View>
      <View onLayout={(event) => { recordPosition('quantity', event); recordPosition('unitId', event); }} style={{ gap: spacing.sm }}>
        <View style={[uiStyles.wrap, { alignItems: 'flex-start', gap: spacing.md }]}>
          <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 120 }}>
            <FormField inputRef={(input) => { inputs.current.quantity = input; }} inputDirection="ltr" label={requiredLabel(t.quantity)} accessibilityLabel={t.quantity + ', ' + t.required} value={draft.quantity} onChangeText={(value) => change('quantity', value)} editable={!saving} keyboardType="decimal-pad" error={displayErrors.quantity} placeholder={t.quantityExample} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 120 }}>
            <FieldGroup label={requiredLabel(t.unit)} error={displayErrors.unitId}>
              <FormDisclosure accessibilityLabel={t.unit + ', ' + t.required + ': ' + (unitLabel ? homeUnitLabels[language][unitLabel.id] : t.chooseUnit)} label={unitLabel ? homeUnitLabels[language][unitLabel.id] : t.chooseUnit} hint={unitsOpen ? t.hideUnits : t.changeUnit} expanded={unitsOpen} disabled={saving} onPress={() => { Keyboard.dismiss(); setUnitsOpen((open) => !open); }} />
            </FieldGroup>
          </View>
        </View>
        {unitsOpen && <View style={[uiStyles.wrap, { gap: spacing.xs }]}>{unitOptions.map((option) => <Chip key={option.id} label={homeUnitLabels[language][option.id]} selected={draft.unitId === option.id} disabled={saving} onPress={() => { change('unitId', option.id); setUnitsOpen(false); }} />)}</View>}
        <AppText variant="caption" muted>{t.numericHint}</AppText>
      </View>
      <View onLayout={(event) => recordPosition('storageId', event)}>
        <FieldGroup label={requiredLabel(t.storage)} error={displayErrors.storageId}><View style={[uiStyles.wrap, { gap: spacing.xs }]}>{storageOptions.map((option) => <Chip key={option.id} label={inventoryMessages[language][option.id]} selected={draft.storageId === option.id} disabled={saving} onPress={() => change('storageId', option.id)} />)}</View></FieldGroup>
      </View>
      <View onLayout={(event) => recordPosition('optional', event)} style={{ gap: spacing.md }}>
        <FormDisclosure label={t.optionalDetails} description={t.optionalSummary} hint={detailsOpen ? t.hideDetails : t.showDetails} expanded={detailsOpen} disabled={saving} onPress={() => { Keyboard.dismiss(); setDetailsOpen((open) => !open); }} />
        {detailsOpen && <>
          <AppText variant="caption" muted>{t.datesHint}</AppText>
          <View onLayout={(event) => recordPosition('purchaseDate', event)}><FormField inputRef={(input) => { inputs.current.purchaseDate = input; }} inputDirection="ltr" label={t.purchase} value={draft.purchaseDate} onChangeText={(value) => change('purchaseDate', value)} editable={!saving} error={displayErrors.purchaseDate} placeholder="YYYY-MM-DD" autoCapitalize="none" autoCorrect={false} /></View>
          <View onLayout={(event) => recordPosition('expirationDate', event)}><FormField inputRef={(input) => { inputs.current.expirationDate = input; }} inputDirection="ltr" label={t.expiration} value={draft.expirationDate} onChangeText={(value) => change('expirationDate', value)} editable={!saving} error={displayErrors.expirationDate} placeholder="YYYY-MM-DD" hint={t.dateOrder} autoCapitalize="none" autoCorrect={false} /></View>
          <View onLayout={(event) => recordPosition('notes', event)}><FormField inputRef={(input) => { inputs.current.notes = input; }} label={t.notesOptional} value={draft.notes} onChangeText={(value) => change('notes', value)} editable={!saving} error={displayErrors.notes} multiline maxLength={MAX_NOTES_LENGTH + 1} hint={t.notesHint} /></View>
        </>}
      </View>
      <FoodPhotoField photoRef={photoRef} disabled={saving} onChange={setPhotoRef} onBusy={(busy) => { photoBusyRef.current = busy; setPhotoBusy(busy); }} />
      {saveError && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{localizedInventoryError(saveError, language)}</AppText>}
      <Button label={photoBusy ? t.photoBusy : saving ? t.saving : item ? t.saveChanges : t.save} disabled={saving || photoBusy} onPress={() => { void submit(); }} />
      <AppText variant="caption" muted>{t.localNote}</AppText>
    </Screen>
  </KeyboardAvoidingView>;
}

// A single disclosure pattern for unit choices and optional fields; no fixed height.
function FormDisclosure({ label, hint, expanded, disabled, onPress, accessibilityLabel = label, description }: { label: string; hint: string; expanded: boolean; disabled: boolean; onPress: () => void; accessibilityLabel?: string; description?: string }) {
  const { colors } = useRemyTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={hint} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: layout.minTouchTarget, padding: spacing.md, borderRadius: radii.md, borderWidth: focused ? 3 : 1,
      borderColor: focused ? colors.focusBorder : colors.inputBorder, backgroundColor: disabled ? colors.disabledSurface : pressed ? colors.pressedSurface : colors.inputSurface })}>
    <View style={{ gap: spacing.xs }}><View style={[uiStyles.row, { flexWrap: 'wrap' }]}><AppText variant={description ? 'heading' : 'label'} style={{ flex: 1, color: disabled ? colors.disabledText : colors.text }}>{label}</AppText><AppText variant="caption" muted accessible={false}>{expanded ? '▴' : '▾'}</AppText></View>
      {description && <AppText variant="caption" muted>{description}</AppText>}
    </View>
  </Pressable>;
}
