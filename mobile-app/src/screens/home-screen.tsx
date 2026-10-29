import { recipeMessages } from '@/i18n/recipes';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, View, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, Screen, SearchField } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { FoodImage } from '@/components/food-image';
import { demoNutrition } from '@/data/kitchen-demo';
import { kitchenPhoto, recipePhotos, recipeTitle, recipeDescription, searchHome } from '@/data/home-content';
import { expirationStatus, storageOptions, useFirstItems, type InventoryItem } from '@/domain/inventory';
import { useInventory, useToday } from '@/providers/inventory-provider';
import { homeMessages, homeUnitLabels } from '@/i18n/home';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';
import type { InventoryReadItem } from '@/domain/backend-inventory-read-model';

export interface BackendHomeData {
  items: InventoryReadItem[];
  status: string;
  today: string;
  retry: () => Promise<void>;
  notice: ReactNode;
  deviceNotice: ReactNode;
  saved: string;
  empty: string;
  emptyBody: string;
  writesSoon: string;
  readOnly: string;
  foodName: (item: InventoryReadItem) => string;
  quantityLabel: (item: InventoryReadItem) => string;
}
type HomeFood = InventoryItem | InventoryReadItem;

const HomeDirectionContext = createContext(false);
function H({ style, ...props }: TextProps & { variant?: 'title' | 'heading' | 'body' | 'caption' | 'label'; muted?: boolean }) {
  const rtl = useContext(HomeDirectionContext);
  return <AppText {...props} style={[{ textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, style]} />;
}

export default function HomeScreen({ backend }: { backend?: BackendHomeData } = {}) {
  const { colors } = useRemyTheme();
  const local = useInventory();
  const localToday = useToday();
  const { items, status, error, retryRead }: { items: readonly HomeFood[]; status: string; error: ReturnType<typeof useInventory>['error']; retryRead: () => Promise<void> } = backend
    ? { items: backend.items, status: backend.status, error: null, retryRead: backend.retry } : local;
  const today = backend ? backend.today : localToday;
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'foods' | 'recipes'>('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const rtl = language === 'ar';
  const t = backend ? { ...homeMessages[language], saved: backend.saved, empty: backend.empty, emptyBody: backend.emptyBody } : homeMessages[language];
  const row = { flexDirection: 'row' as const, direction: rtl ? 'rtl' as const : 'ltr' as const, alignItems: 'center' as const, gap: spacing.md };
  const number = (value: number) => value.toLocaleString(language);
  const heading = (title: string, action?: ReactNode) => <View style={[row, { flexWrap: 'wrap' }]}><H variant="heading" style={{ flex: 1 }}>{title}</H>{action}</View>;
  const matches = searchHome(status === 'ready' ? items : [], query, language, scope);
  if (backend && status === 'ready' && scope !== 'recipes') {
    const term = query.trim().toLocaleLowerCase(language);
    matches.foods = backend.items.filter(item => [item.name, backend.foodName(item)].some(name => name.toLocaleLowerCase(language).includes(term)));
  }
  const searching = query.trim() !== '' || scope !== 'all';
  const priority = useFirstItems(items, today);
  const foodTile = (item: HomeFood) => {
    const name = backend ? backend.foodName(item as InventoryReadItem) : item.name;
    const expiry = expirationStatus(item, today);
    const expiryText = expiry.kind === 'unknown' ? t.unknown : expiry.kind === 'expired' ? t.expired : expiry.kind === 'due' ? t.today : `${t.soon} ${number(expiry.days!)}`;
    return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${name}. ${expiryText}`}
      onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })}
      style={({ pressed }) => ({ width: 190, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
      <View style={{ height: 58, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.selectedSurface, borderRadius: radii.md }}><Icon name="food" size={30} /></View>
      <H variant="label">{name}</H><H variant="caption" muted>{backend ? backend.quantityLabel(item as InventoryReadItem) : <>{number(item.quantity as number)} {homeUnitLabels[language][item.unitId!]}</>}</H>
      {backend && (item as InventoryReadItem).readOnly && <H variant="caption" muted>{backend.readOnly}</H>}
      <H variant="caption" style={{ color: expiry.kind === 'expired' ? colors.errorText : expiry.days !== null && expiry.days <= 3 ? colors.warningText : colors.textSubtle }}>{expiryText}</H>
    </Pressable>;
  };
  const recipeTile = (recipe: (typeof matches.recipes)[number]) => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={`${recipeTitle(recipe.id, language)}. ${t.preview}`}
    onPress={() => setPreviewId(recipe.id)} style={({ pressed }) => ({ width: 258, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: pressed ? colors.pressedSurface : colors.surface })}>
    <FoodImage uri={recipePhotos[recipe.id]} label={t.photo} height={160} />
    <View style={{ padding: spacing.lg, gap: spacing.sm }}><H variant="heading">{recipeTitle(recipe.id, language)}</H>
      <View style={row}><Icon name="clock" size={16} /><H variant="caption" muted>{number(recipe.minutes)} {t.minutes}</H></View>
      <H variant="caption" muted>{recipeDescription(recipe.id, language)}</H></View>
  </Pressable>;
  const selectedRecipe = matches.recipes.find((recipe) => recipe.id === previewId);
  return <HomeDirectionContext.Provider value={rtl}><Screen><View style={{ gap: spacing.xl, direction: rtl ? 'rtl' : 'ltr' }}>
    <View style={row}><H variant="title" style={{ flex: 1 }}>{t.greeting}</H>
      <Pressable accessibilityRole="button" accessibilityLabel={t.notifications} onPress={() => router.push({ pathname: '/feature', params: { feature: 'notifications' } })}
        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radii.md, backgroundColor: pressed ? colors.pressedSurface : colors.surface, alignItems: 'center', justifyContent: 'center' })}><Icon name="bell" /></Pressable></View>
    <View style={{ gap: spacing.sm }}><SearchField value={query} onChangeText={setQuery} placeholder={t.search} accessibilityLabel={t.search} autoCorrect={false}
      style={{ textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }} />
      <View style={[row, { flexWrap: 'wrap' }]}>{(['all', 'foods', 'recipes'] as const).map((value) => <Chip key={value} label={t[value]} selected={scope === value} onPress={() => setScope(value)} />)}</View>
    </View>
    {backend ? <>{backend.notice}<H variant="caption" muted>{backend.writesSoon}</H></> : status !== 'ready' && <Card><H muted>{status === 'error' ? t.readError : t.loading}</H>{status === 'error' && <Button label={t.retry} onPress={() => { void retryRead(); }} />}</Card>}
    {status === 'ready' && error && <H accessibilityRole="alert" style={{ color: colors.errorText }}>{t.writeError}</H>}
    {searching ? <View style={{ gap: spacing.lg }}>{heading(t.results)}
      {!matches.foods.length && !matches.recipes.length && <H muted>{t.none}</H>}
      {matches.foods.length > 0 && <>{heading(t.foods)}<ScrollView horizontal style={{ direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ gap: spacing.md }}>{matches.foods.map(foodTile)}</ScrollView></>}
      {matches.recipes.length > 0 && <><H variant="caption" muted>{t.sample}</H><ScrollView horizontal style={{ direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ gap: spacing.md }}>{matches.recipes.map(recipeTile)}</ScrollView></>}
    </View> : <>
      {status === 'ready' && <Card style={{ padding: 0, overflow: 'hidden' }}>
        <FoodImage uri={kitchenPhoto} height={110} label={t.photo} />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>{heading(t.overview)}<H muted>{number(items.length)} {t.saved}</H>
          <View style={[row, { flexWrap: 'wrap' }]}>{storageOptions.map((storage) => <View key={storage.id} style={{ flex: 1, minWidth: 80 }}>
            <H variant="heading">{number(items.filter((item) => item.storageId === storage.id).length)}</H><H variant="caption" muted>{t[storage.id]}</H>
          </View>)}</View>
          <Button label={backend || items.length ? t.openKitchen : t.add} icon={backend || items.length ? 'kitchen' : 'add'} onPress={() => router.navigate(backend || items.length ? '/kitchen' : '/food/manual')} />
          {backend && <Button label={t.add} icon="add" disabled />}
        </View>
      </Card>}
      {status === 'ready' && <View style={{ gap: spacing.md }}>{heading(t.useFirst, <Button label={t.viewAll} variant="text" onPress={() => router.navigate('/kitchen')} />)}
        {priority.length ? <ScrollView horizontal style={{ direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ gap: spacing.md }}>{priority.map(foodTile)}</ScrollView> :
          <View style={{ gap: spacing.sm }}><H variant="label">{items.length ? t.noPriority : t.empty}</H><H variant="caption" muted>{items.length ? t.dateNote : t.emptyBody}</H></View>}
        {priority.length > 0 && <H variant="caption" muted>{t.dateNote}</H>}
      </View>}
      <View style={{ gap: spacing.md }}>{heading(t.ideas, <Button label={recipeMessages[language].viewAll} variant="text" onPress={() => router.push({ pathname: '/feature', params: { feature: 'recipes' } })} />)}<H variant="caption" muted>{t.sample}</H>
        <ScrollView horizontal style={{ direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ gap: spacing.md }}>{matches.recipes.map(recipeTile)}</ScrollView>
      </View>
      <Card>{heading(t.nutrition)}<H variant="caption" muted>{t.lunch}</H>
        <View style={[row, { flexWrap: 'wrap' }]}>{[[demoNutrition.calories, t.kcal], [demoNutrition.proteinGrams, t.protein], [demoNutrition.fiberGrams, t.fiber]].map(([value, label]) =>
          <View key={label} style={{ flex: 1, minWidth: 75 }}><H variant="heading">{number(value as number)}</H><H variant="caption" muted>{label}</H></View>)}</View><H variant="caption" muted>{t.nutritionNote}</H>
      </Card>
      <View style={{ gap: spacing.md }}>{heading(t.shortcuts)}<Button label={t.plan} icon="calendar" variant="secondary" onPress={() => router.push({ pathname: '/feature', params: { feature: 'planner' } })} />
        <Button label={t.shop} icon="shopping" variant="secondary" onPress={() => router.push({ pathname: '/feature', params: { feature: 'shopping' } })} /></View>
    </>}
    {backend?.deviceNotice}
    <Modal visible={previewId !== null} transparent animationType="fade" onRequestClose={() => setPreviewId(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.overlay }}><ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}>
        <Card accessibilityViewIsModal style={{ backgroundColor: colors.modalSurface, maxWidth: 600, width: '100%', alignSelf: 'center', direction: rtl ? 'rtl' : 'ltr' }}>
          <Button label={t.close} variant="text" onPress={() => setPreviewId(null)} />
          <H variant="caption" muted>{t.preview}</H>
          {selectedRecipe && <><FoodImage key={selectedRecipe.id} uri={recipePhotos[selectedRecipe.id]} label={t.photo} height={180} />
            <H variant="title">{recipeTitle(selectedRecipe.id, language)}</H><H muted>{recipeDescription(selectedRecipe.id, language)}</H>
            <H variant="caption" muted>{number(selectedRecipe.minutes)} {t.minutes}</H><H variant="heading">{t.ingredients}</H>
            {selectedRecipe.ingredients.map((id) => <H key={id}>{t[id]}</H>)}</>}
          {selectedRecipe && <Button label={recipeMessages[language].open} onPress={() => { setPreviewId(null); router.push({ pathname: '/recipes/[id]', params: { id: selectedRecipe.id } }); }} />}
        </Card>
      </ScrollView></SafeAreaView>
    </Modal>
  </View></Screen></HomeDirectionContext.Provider>;
}
