import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { getAuth } from '@/services/auth';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
import { isSignedOutError } from '@/services/auth-validation';
import { CookedMealPreparation, CookedMealStore } from '@/services/cooked-it';
import { guessMealType, mealRows, mealTypes } from '@/domain/cooked-it';
import { toMobileUnit } from '@/domain/inventory-enum-adapters';
import { homeUnitLabels } from '@/i18n/home';
import { backendKitchenMessages } from '@/i18n/backend-kitchen';
import { backendRecipeMessages, recipeText } from '@/i18n/backend-recipes';
import { cookedItMessages } from '@/i18n/cooked-it';
import { recipeFoodName, recipeQuantity } from '@/utils/backend-recipe-view';
import { displayInventoryQuantity } from '@/utils/backend-kitchen-view';
import { stockTotal } from '@/services/backend-stock-actions';
import { spacing } from '@/theme/tokens';
import type { BackendUnit } from '@/domain/backend-inventory';

export default function CookedItRoute() {
  return isBackendInventoryEnabled() ? <EnabledCookedItScreen /> : <Off />;
}
function Off() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useEffect(() => { router.replace({ pathname: '/recipes/[id]', params: { id } }); }, [id]);
  return null;
}
function EnabledCookedItScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipes = useBackendRecipes();
  const { language } = useLanguage();
  if (recipes.status === 'signed-out') return <Screen rtl={language === 'ar'}><EmptyState title={backendRecipeMessages[language].signInTitle}
    description={backendRecipeMessages[language].signInBody} action={backendRecipeMessages[language].signIn} onPress={() => router.push('/login')} /></Screen>;
  return <ConfirmationSession key={`${recipes.owner}:${id}`} id={id} />;
}
function ConfirmationSession({ id }: { id: string }) {
  const recipes = useBackendRecipes(), kitchen = useBackendKitchen();
  const { owner, ensureDetail } = recipes;
  const { language } = useLanguage(), { colors } = useRemyTheme();
  const t = cookedItMessages[language], r = backendRecipeMessages[language], rtl = language === 'ar';
  const [preparation] = useState(() => new CookedMealPreparation());
  const { store, error: initialError } = useSyncExternalStore(preparation.subscribe, preparation.getSnapshot, preparation.getSnapshot);
  useEffect(() => { if (owner) void ensureDetail(id); }, [owner, ensureDetail, id]);
  const detail = recipes.detail?.id === id ? recipes.detail : null;
  useEffect(() => {
    if (store || initialError || !detail?.recipe || !detail.suggestion || kitchen.status !== 'ready') return;
    const recipe = detail.recipe, suggestion = detail.suggestion;
    preparation.prepare(() => new CookedMealStore(getAuth(), AsyncStorage, recipe,
        mealRows(recipe, suggestion, kitchen.items, kitchen.today), guessMealType(new Date()),
        async () => { const inventory = await kitchen.refreshAfterMeal(); await recipes.refreshAfterMeal(id, inventory); },
        () => { recipes.showMealRemoved(id); router.replace({ pathname: '/recipes/[id]', params: { id } }); }));
  }, [store, initialError, detail, kitchen, recipes, id, preparation]);
  const failed = initialError || detail?.status === 'error' || detail?.matchingError || recipes.status === 'error' || kitchen.status === 'error';
  const unavailable = detail?.status === 'ready' && !detail.matchingLoading && !detail.suggestion;
  const retry = () => { preparation.retry(); void kitchen.retry(); void recipes.loadDetail(id); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <PageHeader title={t.title} action={<Button label={t.cancel} variant="text" onPress={() => { if (!store?.getSnapshot().saving && !store?.getSnapshot().refreshPending) router.replace({ pathname: '/recipes/[id]', params: { id } }); }} />} />
    {store ? <MealForm store={store} /> : failed || unavailable ? <Card>
      <AppText accessibilityRole="alert">{unavailable ? r.matchingUnavailable : r.error}</AppText><Button label={r.retry} onPress={retry} />
    </Card> : <AppText accessibilityLiveRegion="polite">{r.loading}</AppText>}
  </Screen></SafeAreaView>;
}
function amountInputValue(value: string) {
  try { return displayInventoryQuantity(stockTotal(value)); }
  catch { return value; }
}
function AmountField({ value = '', onChangeText, ...props }: ComponentProps<typeof FormField>) {
  const [draft, setDraft] = useState<string | null>(null);
  return <FormField {...props} value={draft ?? amountInputValue(value)}
    onFocus={() => setDraft(amountInputValue(value))} onBlur={() => setDraft(null)}
    onChangeText={text => { setDraft(text); onChangeText?.(text); }} />;
}
export function MealForm({ store }: { store: CookedMealStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const { language } = useLanguage(), { colors } = useRemyTheme();
  const t = cookedItMessages[language], r = backendRecipeMessages[language], dir = language === 'ar' ? 'rtl' : 'ltr';
  const locked = state.saving || state.refreshPending;
  const error = state.error as { codes?: string[]; foodId?: string; message?: string } | null;
  const conversion = error?.codes?.some(code => ['UNIT_NOT_CONVERTIBLE', 'UNIT_CONVERSION_UNAVAILABLE', 'INVALID_QUANTITY'].includes(code));
  const rowError = conversion && state.rows.some(row => row.foodId === error?.foodId) ? error?.foodId : undefined;
  const unitLabel = (unit: BackendUnit) => { const mapped = toMobileUnit(unit); return mapped.supported ? homeUnitLabels[language][mapped.value] : backendKitchenMessages[language][unit as 'TABLESPOON' | 'TEASPOON']; };
  const available = state.insufficient;
  const availableText = available ? recipeText(t.available, { amount: recipeQuantity(available.available, available.unit, language) }) : '';
  const topError = conversion ? t.conversion : error?.message === 'STALE_CONTEXT' ? t.stale : isSignedOutError(error) ? r.signInTitle : state.refreshPending ? t.refreshError : t.error;
  return <>
    <FormField label={t.servings} value={state.servings} keyboardType="decimal-pad" inputDirection="ltr" editable={!locked}
      error={state.validation.includes('servings') ? t.quantity : undefined} onChangeText={value => store.change('servings', value)} />
    <AppText variant="label" dir={dir}>{t.mealType}</AppText>
    <View style={uiStyles.wrap}>{mealTypes.map(type => <Chip key={type} label={t[type]} selected={state.mealType === type} disabled={locked} onPress={() => store.change('mealType', type)} />)}</View>
    {state.rows.map(row => <Card key={row.id}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={recipeFoodName(row, language)} accessibilityState={{ checked: row.checked, disabled: locked }}
        disabled={locked} onPress={() => store.change('checked', !row.checked, row.id)} style={{ flexDirection: 'row', direction: dir, alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 24, height: 24, borderWidth: 1, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>{row.checked && <Icon name="check" size={18} />}</View>
        <AppText variant="label" dir={dir}>{recipeFoodName(row, language)}</AppText>
      </Pressable>
      <AppText dir={dir}>{t[row.status]}{row.optional ? ` · ${t.optional}` : ''}</AppText>
      <AmountField label={`${t.amount} · ${unitLabel(row.unit)}`} value={row.amount} keyboardType="decimal-pad" inputDirection="ltr" editable={!locked && row.checked}
        hint={row.status === 'UNKNOWN' ? t.unknownHint : undefined} error={state.validation.includes(row.id) ? t.quantity : undefined}
        onChangeText={value => store.change('amount', value, row.id)} />
      {available?.foodId === row.foodId && <AppText dir={dir} accessibilityRole="alert" style={{ color: colors.errorText }}>{availableText}</AppText>}
      {rowError === row.foodId && <AppText dir={dir} accessibilityRole="alert" style={{ color: colors.errorText }}>{t.conversion}</AppText>}
    </Card>)}
    {available && !state.rows.some(row => row.foodId === available.foodId) && <AppText dir={dir} accessibilityRole="alert">{availableText}</AppText>}
    {state.validation.includes('items') && <AppText dir={dir} accessibilityRole="alert">{t.items}</AppText>}
    {error && !rowError && <AppText dir={dir} accessibilityRole="alert">{topError}</AppText>}
    <Button label={state.saving ? t.saving : state.refreshPending ? r.retry : t.confirm}
      disabled={state.saving || state.rows.some(row => row.checked && row.status === 'UNKNOWN' && !row.amount.trim())}
      onPress={() => { void store.submit(); }} />
  </>;
}
