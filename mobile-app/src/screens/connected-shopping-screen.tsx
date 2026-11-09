import { useLanguage } from '@/providers/language-provider';
import { foodName } from '@/i18n/catalog-food-names';
import { catalogLabel, localizedUnit } from '@/i18n/catalog-labels';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import Animated, { Easing, FadeOut, LinearTransition, cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { feedback } from '@/services/feedback';
import { useRemyTheme } from '@/theme/provider';
import { formatAmount } from '@/domain/plan-shopping';
import { AppText, Button, Card, Chip, EmptyState, SectionHeader, SearchField, TextTabs, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { addFoodQuantity } from '@/services/backend-add-food';
import { kitchenRequest, loadShopping, operationKey, searchFoods,  type CatalogFood, type ShoppingItem } from '@/services/kitchen-api';
import { addPlannedMealsToShopping, loadFoodAisles } from '@/services/plan-shopping';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { ConnectedScreen, DataNotice, Feedback, useAction, useCopy, useKitchenData, useKitchenIdentity } from './connected-ui';

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export function ConnectedShoppingScreen() { const identity = useKitchenIdentity(); return <ShoppingContent key={identity} />; }
function ShoppingContent() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { language } = useLanguage();
  const copy = useCopy(); const { colors } = useRemyTheme(); const state = useKitchenData(loadShopping, 'shopping'); const action = useAction(state.reload); const [filter, setFilter] = useState<'NEEDED' | 'ALL'>('NEEDED'); const [query, setQuery] = useState(''); const [editing, setEditing] = useState(add === '1'); const [search, setSearch] = useState(''); const [foods, setFoods] = useState<CatalogFood[]>([]); const [food, setFood] = useState<CatalogFood | null>(null); const [quantity, setQuantity] = useState('1'); const [listName, setListName] = useState('Kitchen shopping'); const pending = useRef<{ signature: string; key: string } | null>(null); const listCreation = useRef<{ name: string; key: string } | null>(null);
  const active = (state.data ?? []).filter(list => list.status === 'ACTIVE');
  const kitchen = useBackendKitchen(); const [view, setView] = useState<'list' | 'aisle'>('list'); const [aisles, setAisles] = useState<Map<string, string>>(new Map()); const [weekNote, setWeekNote] = useState<string | null>(null);
  const foodIds = active.flatMap(list => list.items.map(item => item.foodId)).join(',');
  useEffect(() => {
    if (view !== 'aisle' || !foodIds) return;
    let live = true; loadFoodAisles(foodIds.split(',')).then(found => { if (live) setAisles(found); }).catch(() => { /* items stay under "Other"; the list itself still works */ });
    return () => { live = false; };
  }, [view, foodIds]);
  const addWeek = () => action.run(async () => {
    setWeekNote(null);
    // Kitchen stock is subtracted only once it has loaded; otherwise every ingredient is listed.
    const result = await addPlannedMealsToShopping(kitchen.status === 'ready' ? kitchen.items.map(item => ({ foodId: item.foodId, quantity: item.quantity, unit: item.backendUnit })) : []);
    setWeekNote(!result.meals ? copy('No meals planned for the next 7 days. Plan some meals first.', 'لا توجد وجبات مخططة للأيام السبعة القادمة. خطط لبعض الوجبات أولًا.')
      : result.added.length ? copy(`Added ${result.added.length === 1 ? '1 ingredient' : `${result.added.length} ingredients`} for ${result.meals === 1 ? '1 planned meal' : `${result.meals} planned meals`}. Food already in Kitchen or on this list was left out.`, `المكونات المضافة: ${result.added.length} (الوجبات المخططة: ${result.meals}). لم يُضف ما في المطبخ أو في القائمة.`)
      : copy('Everything for your planned meals is already in Kitchen or on this list.', 'كل ما تحتاجه وجباتك المخططة موجود في المطبخ أو في القائمة.'));
  });
  const other = copy('Other', 'أخرى');
  // Compact Mob-style rows: tap the row to tick it off, one card per list or aisle.
  // The tick shows at once (with its haptic and sound); the server catches up, and a failure puts it back.
  const [ticked, setTicked] = useState<Record<string, string>>({});
  const reduced = useReducedMotion();
  const statusOf = (item: ShoppingItem) => ticked[item.id] ?? item.status;
  const toggle = (item: ShoppingItem) => {
    const next = statusOf(item) === 'PURCHASED' ? 'NEEDED' : 'PURCHASED';
    if (next === 'PURCHASED') feedback.tick(); else feedback.select();
    setTicked(current => ({ ...current, [item.id]: next }));
    void action.run(() => kitchenRequest('mutation CheckShopping($input: UpdateShoppingItemInputType!) { updateShoppingListItem(input: $input) { id status } }', { input: { id: item.id, status: next } }))
      .finally(() => setTicked(current => { const rest = { ...current }; delete rest[item.id]; return rest; }));
  };
  const itemRow = (item: ShoppingItem, index: number) => { const done = statusOf(item) === 'PURCHASED'; const amount = `${formatAmount(item.quantity)} ${localizedUnit(item.unit, language)}`;
    return <Animated.View key={item.id} layout={reduced ? undefined : LinearTransition.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1))} exiting={reduced ? undefined : FadeOut.duration(150)} style={[uiStyles.row, { minHeight: 56, borderTopWidth: index ? 1 : 0, borderColor: colors.divider }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: action.busy }} accessibilityLabel={`${foodName(item.foodName, language)}, ${amount}`} disabled={action.busy} onPress={() => toggle(item)}
        style={({ pressed }) => [uiStyles.row, uiStyles.grow, { paddingVertical: 10, opacity: pressed ? 0.7 : 1 }]}>
        <Animated.View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: done ? colors.primary : colors.inputBorder, backgroundColor: done ? colors.primary : 'transparent',
          transitionProperty: ['backgroundColor', 'borderColor'], transitionDuration: '160ms', transitionTimingFunction: EASE_OUT }}>
          <Animated.View style={{ opacity: done ? 1 : 0, transform: [{ scale: done || reduced ? 1 : 0.5 }], transitionProperty: ['opacity', 'transform'], transitionDuration: '180ms', transitionTimingFunction: EASE_OUT }}>
            <Icon name="check" size={16} color={colors.onPrimary} /></Animated.View>
        </Animated.View>
        <AppText variant="label" style={[uiStyles.grow, done && { color: colors.textSecondary, textDecorationLine: 'line-through' }]}>{foodName(item.foodName, language)}</AppText>
        <AppText style={{ color: colors.textSecondary }}>{amount}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${copy('Remove', 'إزالة')} ${foodName(item.foodName, language)}`} disabled={action.busy} hitSlop={8} onPress={() => { void action.run(() => kitchenRequest('mutation RemoveShopping($id: ID!) { removeShoppingItem(id: $id) }', { id: item.id }), undefined, 'remove'); }}
        style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}><AppText variant="caption" style={{ color: colors.destructive }}>{copy('Remove', 'إزالة')}</AppText></Pressable>
    </Animated.View>; };
  const rows = (items: ShoppingItem[]) => items.length ? <Card style={{ gap: 0, paddingVertical: 4 }}>{items.map(itemRow)}</Card> : null;
  const byAisle = (items: ShoppingItem[]) => [...items.reduce((groups, item) => { const aisle = aisles.get(item.foodId) ?? other; groups.set(aisle, [...(groups.get(aisle) ?? []), item]); return groups; }, new Map<string, ShoppingItem[]>())]
    .sort(([a], [b]) => a === other ? 1 : b === other ? -1 : a.localeCompare(b));
  const save = async () => {
    if (!food) throw new Error(copy('Choose a food from the catalogue.', 'اختر طعامًا من القائمة.'));
    const amount = addFoodQuantity(quantity); let list = (await loadShopping()).find(entry => entry.status === 'ACTIVE');
    const name = listName.trim() || 'Kitchen shopping';
    if (listCreation.current?.name !== name) listCreation.current = { name, key: operationKey() };
    if (!list) list = (await kitchenRequest<{ createShoppingList: { id: string; name: string; status: string; items: never[] } }>('mutation NewList($input: CreateShoppingListInputType!) { createShoppingList(input: $input) { id name status items { id } } }', { input: { name, idempotencyKey: listCreation.current.key } })).createShoppingList;
    const signature = JSON.stringify([list.id, food.id, amount, food.defaultUnit]);
    if (pending.current?.signature !== signature) pending.current = { signature, key: operationKey() };
    await kitchenRequest('mutation AddShopping($input: AddToShoppingListInputType!) { addToShoppingList(input: $input) { id } }', { input: { shoppingListId: list.id, foodId: food.id, quantity: amount, unit: food.defaultUnit, idempotencyKey: pending.current.key } });
    pending.current = null; setEditing(false); setFood(null); setSearch(''); setFoods([]); setQuantity('1');
  };
  return <ConnectedScreen title={copy('Shopping list', 'قائمة المشتريات')}>
    {/* One main action; the two ways to fill the list in bulk sit under it as quiet text actions. */}
    <View style={{ gap: 4 }}>
      <Button label={copy('Add item', 'إضافة عنصر')} icon="add" onPress={() => setEditing(!editing)} />
      <View style={[uiStyles.wrap, { columnGap: 16 }]}>
        <Button label={copy("Add this week's meals", 'إضافة وجبات هذا الأسبوع')} icon="calendar" variant="text" rtl={language === 'ar'} disabled={action.busy} onPress={() => { void addWeek(); }} />
        <Button label={copy('Write a quick list', 'اكتب قائمة سريعة')} icon="manual" variant="text" rtl={language === 'ar'} onPress={() => router.push('/quick-shopping')} />
      </View>
    </View>
    <DataNotice {...state} /><Feedback message={action.message} /><Feedback message={weekNote} />
    {editing && <Card><FormField label={copy('List name', 'اسم القائمة')} value={listName} onChangeText={setListName} /><FormField label={copy('Find a food', 'ابحث عن طعام')} value={search} onChangeText={value => { setSearch(value); setFood(null); }} /><Button label={copy('Search catalogue', 'بحث في قائمة الأطعمة')} variant="secondary" disabled={action.busy || !search.trim()} onPress={() => { void action.run(async () => { setFoods(await searchFoods(search.trim())); }); }} />{foods.map(value => <Chip key={value.id} label={`${foodName(value.name, language)} · ${localizedUnit(value.defaultUnit, language)}`} selected={food?.id === value.id} onPress={() => setFood(value)} />)}{food && <AppText>{copy('Selected', 'المحدد')}: {foodName(food.name, language)}</AppText>}<FormField label={`${copy('Quantity', 'الكمية')} (${food ? localizedUnit(food.defaultUnit, language) : '…'})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /><Button label={copy('Save item', 'حفظ العنصر')} disabled={action.busy} onPress={() => { void action.run(save, copy('Added to your list.', 'أُضيف إلى قائمتك.'), 'pop'); }} /><Button label={copy('Cancel', 'إلغاء')} variant="text" onPress={() => setEditing(false)} /></Card>}
    <SearchField value={query} onChangeText={setQuery} placeholder={copy('Search your list', 'ابحث في قائمتك')} /><View style={[uiStyles.row, { justifyContent: 'space-between' }]}>
      <View style={uiStyles.grow}><TextTabs tabs={[{ key: 'NEEDED', label: copy('To buy', 'للشراء') }, { key: 'ALL', label: copy('All items', 'كل العناصر') }]} value={filter} onChange={key => setFilter(key as 'NEEDED' | 'ALL')} rtl={language === 'ar'} /></View>
      <Button label={view === 'list' ? copy('By aisle', 'حسب القسم') : copy('As a list', 'كقائمة')} variant="text" onPress={() => setView(view === 'list' ? 'aisle' : 'list')} />
    </View>
    {state.data && !active.length && <EmptyState title={copy('Ready for your next shop.', 'جاهز للتسوق القادم.')} description={copy('Add food here or send ingredients from a recipe.', 'أضف طعامًا هنا أو مكونات من وصفة.')} />}
    {active.map(list => <View key={list.id} style={{ gap: 12 }}><SectionHeader title={catalogLabel(list.name, language)} />{(() => { const items = list.items.filter(item => (filter === 'ALL' || item.status === 'NEEDED') && (item.foodName.toLowerCase().includes(query.toLowerCase()) || foodName(item.foodName, language).includes(query.trim()))); return view === 'list' ? rows(items) : byAisle(items).map(([aisle, entries]) => <View key={aisle} style={{ gap: 8 }}><AppText variant="label" muted>{catalogLabel(aisle, language)}</AppText>{rows(entries)}</View>); })()}<Button label={copy('Finish this list', 'إنهاء هذه القائمة')} variant="text" disabled={action.busy} onPress={() => Alert.alert(copy('Finish shopping?', 'إنهاء التسوق؟'), copy('This archives the list. Purchased items are not automatically added to kitchen stock.', 'تؤرشف القائمة. لا تُضاف المشتريات تلقائيًا إلى مخزون المطبخ.'), [{ text: copy('Cancel', 'إلغاء'), style: 'cancel' }, { text: copy('Finish list', 'إنهاء القائمة'), onPress: () => { void action.run(() => kitchenRequest('mutation FinishList($input: UpdateShoppingListInputType!) { updateShoppingList(input: $input) { id status } }', { input: { id: list.id, status: 'COMPLETED' } })); } }])} /></View>)}
    <AppText variant="caption" muted>{copy('Checking an item marks your shopping progress. Add purchased food to Kitchen to track its quantity and expiry.', 'تحديد العنصر يتابع مشترياتك. أضف الطعام للمطبخ لتتبع الكمية والصلاحية.')}</AppText>
  </ConnectedScreen>;
}
