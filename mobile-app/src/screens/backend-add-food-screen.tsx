import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionRow, AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, uiStyles } from '@/components/ui/core';
import { FieldGroup, FormField } from '@/components/ui/form-field';
import { storageOptions, unitOptions } from '@/domain/inventory';
import { useAuth } from '@/providers/auth-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { useLanguage } from '@/providers/language-provider';
import { backendAddFoodMessages } from '@/i18n/backend-add-food';
import { backendKitchenMessages } from '@/i18n/backend-kitchen';
import { foodEntryMessages } from '@/i18n/food-entry';
import { homeUnitLabels } from '@/i18n/home';
import { inventoryMessages } from '@/i18n/inventory';
import { getAuth } from '@/services/auth';
import { BackendAddFoodStore, catalogChoiceName } from '@/services/backend-add-food';
import { isSignedOutError } from '@/services/auth-validation';

export default function BackendAddFoodScreen() {
  const { user, busy, ready } = useAuth();
  const { language } = useLanguage();
  const t = backendKitchenMessages[language];
  if (!ready || busy) return <Screen rtl={language === 'ar'}><AppText>{t.loading}</AppText></Screen>;
  if (!user) return <Screen rtl={language === 'ar'}><EmptyState title={t.signInTitle} description={t.signInBody} action={t.signIn} onPress={() => router.push('/login')} /></Screen>;
  // A different identity gets a fresh draft and can never retry the previous user's operation.
  return <BackendAddFoodForm key={`${user.id}:${getAuth().getIdentityRevision()}`} />;
}

function BackendAddFoodForm() {
  const { language } = useLanguage();
  const t = backendAddFoodMessages[language], f = foodEntryMessages[language];
  const { retry, showAdded } = useBackendKitchen();
  const [store] = useState(() => new BackendAddFoodStore(getAuth(), AsyncStorage));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { draft, errors } = state;
  const [finishing, setFinishing] = useState(false);
  const [completionError, setCompletionError] = useState(false);
  const saving = state.saving || finishing;
  const savingRef = useRef(false);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setCompletionError(false);
    try {
      if (!await store.submit()) return;
      setFinishing(true);
      await retry();
      store.assertIdentity();
      showAdded();
      router.replace('/kitchen');
    } catch { setCompletionError(true); }
    finally { savingRef.current = false; setFinishing(false); }
  };
  const error = state.error as { codes?: string[] } | null;
  const message = isSignedOutError(error) ? t.signedOut : error?.codes?.includes('EMAIL_NOT_VERIFIED') ? t.verify
    : error?.codes?.includes('FORBIDDEN') ? t.forbidden : t.saveError;
  return <Screen rtl={language === 'ar'}>
    <PageHeader title={f.add} action={<Button label={f.cancel} variant="text" disabled={saving} onPress={() => router.replace('/kitchen')} />} />
    <FormField label={`${t.search} *`} value={draft.search} editable={!saving} onChangeText={value => store.change('search', value)} error={errors.food && t.choose} autoCorrect={false} />
    {draft.food && <Card><AppText variant="caption" muted>{t.selected}</AppText><AppText>{catalogChoiceName(draft.food, language)}</AppText></Card>}
    {state.searchStatus === 'loading' && <AppText accessibilityLiveRegion="polite">{t.searching}</AppText>}
    {state.searchStatus === 'ready' && state.results.length === 0 && <AppText accessibilityLiveRegion="polite">{t.noMatch}</AppText>}
    {state.searchStatus === 'error' && <Card><AppText accessibilityRole="alert">{t.searchError}</AppText><Button label={backendKitchenMessages[language].retry} disabled={saving} onPress={() => { void store.search(); }} /></Card>}
    {state.results.length > 0 && <Card style={{ padding: 0 }}>{state.results.map(food => <ActionRow key={food.id} title={catalogChoiceName(food, language)} disabled={saving} rtl={language === 'ar'} onPress={() => store.select(food)} />)}</Card>}
    {state.cursor && <Button label={t.more} variant="text" disabled={saving || state.searchStatus === 'loading'} onPress={() => { void store.search(true); }} />}
    <FormField label={`${f.quantity} *`} value={draft.quantity} editable={!saving} keyboardType="decimal-pad" inputDirection="ltr" onChangeText={value => store.change('quantity', value)} error={errors.quantity && t.quantity} hint={t.numericHint} />
    <FieldGroup label={`${f.unit} *`} error={errors.unit && t.required}><View style={uiStyles.wrap}>
      {unitOptions.filter(unit => unit.id !== 'packs').map(unit => <Chip key={unit.id} label={homeUnitLabels[language][unit.id]} selected={draft.unit === unit.id} disabled={saving} onPress={() => store.change('unit', unit.id)} />)}
    </View></FieldGroup>
    <FieldGroup label={`${f.storage} *`} error={errors.storage && t.required}><View style={uiStyles.wrap}>
      {storageOptions.map(storage => <Chip key={storage.id} label={inventoryMessages[language][storage.id]} selected={draft.storage === storage.id} disabled={saving} onPress={() => store.change('storage', storage.id)} />)}
    </View></FieldGroup>
    <FormField label={f.purchase} value={draft.purchaseDate} editable={!saving} inputDirection="ltr" placeholder="YYYY-MM-DD" autoCorrect={false} onChangeText={value => store.change('purchaseDate', value)} error={errors.purchaseDate && t.date} hint={t.purchaseHint} />
    <FormField label={f.expiration} value={draft.expiryDay} editable={!saving} inputDirection="ltr" placeholder="YYYY-MM-DD" autoCorrect={false} onChangeText={value => store.change('expiryDay', value)} error={errors.expiryDay && (errors.expiryDay === 'dateOrder' ? t.dateOrder : t.date)} hint={t.datesHint} />
    {state.error !== null && <AppText accessibilityRole="alert">{message}</AppText>}
    {completionError && <AppText accessibilityRole="alert">{backendKitchenMessages[language].error}</AppText>}
    <Button label={saving ? f.saving : f.save} disabled={saving} onPress={() => { void save(); }} />
    <AppText variant="caption" muted>{t.saved}</AppText>
    <Card><AppText variant="heading">{f.methods}</AppText>{[f.camera, f.gallery, f.receipt].map(label => <Button key={label} label={`${label} · ${t.comingSoon}`} disabled />)}</Card>
  </Screen>;
}
