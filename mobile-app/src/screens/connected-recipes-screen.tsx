import { useLanguage } from '@/providers/language-provider';
import { NutritionPanel, useNutritionGoal } from '@/components/nutrition-panel';
import { energyLabel } from '@/domain/nutrition';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { recipeFoodName, recipeIngredientStatus } from '@/utils/backend-recipe-view';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { cookedItMessages } from '@/i18n/cooked-it';
import { BackendRecipesScreen } from './backend-recipes-screen';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';
import { formatAmount } from '@/domain/plan-shopping';
import { radii, spacing } from '@/theme/tokens';
import { AppText, Button, Card, EmptyState, SearchField, uiStyles } from '@/components/ui/core';
import { RecipeArt, RecipeCard, RecipeGrid, RecipeTabs, filterRecipes, recipeMinutes, recipeTabs, useGridCardWidth } from '@/components/recipe-card';
import { FormField } from '@/components/ui/form-field';
import { getCookbookContent } from '@/data/cookbook-content';
import { kitchenRequest, loadRecipe, loadRecipes, loadShopping, operationKey, recipeDetailFields, scaleQuantity, todayKey, unitLabel, type ShoppingList } from '@/services/kitchen-api';
import { ConnectedScreen, DataNotice, Feedback, useAction, useCopy, useKitchenData, useKitchenIdentity } from './connected-ui';

function RoundButton({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? colors.disabledSurface : pressed ? colors.primaryPressed : colors.primary })}>
    <AppText variant="heading" style={{ color: disabled ? colors.disabledText : colors.onPrimary, lineHeight: 24 }}>{label}</AppText></Pressable>;
}
export function ConnectedRecipesScreen() {
  const { browse } = useLocalSearchParams<{ browse?: string }>();
  const [catalogue, setCatalogue] = useState(!!browse);
  return catalogue ? <CatalogueScreen initial={browse ?? 'all'} onSuggestions={() => setCatalogue(false)} /> : <BackendRecipesScreen onBrowseAll={() => setCatalogue(true)} />;
}
function CatalogueScreen({ initial, onSuggestions }: { initial: string; onSuggestions: () => void }) {
  const copy = useCopy(); const { language } = useLanguage(); const state = useKitchenData(loadRecipes); const width = useGridCardWidth();
  const [query, setQuery] = useState(''); const [tab, setTab] = useState(initial); const [limit, setLimit] = useState(24);
  const all = [...(state.data ?? [])].sort((a, b) => Number(!!getCookbookContent(b.name, b.id)) - Number(!!getCookbookContent(a.name, a.id)));
  const visible = filterRecipes(all, tab).filter(recipe => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const choose = (key: string) => { if (key === 'kitchen') onSuggestions(); else { setTab(key); setLimit(24); } };
  const time = (recipe: (typeof all)[number]) => { const m = recipeMinutes(recipe); return m === null ? null : `${m} ${copy('min', 'دقيقة')}`; };
  return <ConnectedScreen title={copy('The cookbook', 'كتاب الطبخ')}>
    <SearchField value={query} onChangeText={value => { setQuery(value); setLimit(24); }} placeholder={copy('Find a recipe', 'ابحث عن وصفة')} />
    <View style={{ gap: 4 }}>
      <RecipeTabs tabs={[...recipeTabs(all, copy, 10, 3), { key: 'kitchen', label: copy('From my kitchen', 'من مطبخي') }]} value={tab} onChange={choose} rtl={language === 'ar'} />
      {state.data && <AppText variant="caption" muted>{visible.length === 1 ? copy('1 recipe', 'وصفة واحدة') : copy(`${visible.length} recipes`, `${visible.length} وصفة`)}</AppText>}
    </View>
    <DataNotice {...state} />
    {!state.loading && state.data && !visible.length && <EmptyState title={copy('No recipes found', 'لم نجد وصفات')} description={copy('Try another search or clear your filters.', 'جرّب بحثًا آخر أو امسح عوامل التصفية.')} action={copy('Clear filters', 'مسح التصفية')} onPress={() => { setQuery(''); setTab('all'); }} />}
    <RecipeGrid>{visible.slice(0, limit).map(recipe => <RecipeCard key={recipe.id} id={recipe.id} name={recipe.name} time={time(recipe)} energy={energyLabel(recipe.nutrition, language)} caption={tab.startsWith('cuisine:') || !recipe.cuisineName ? copy(`${recipe.servings} servings`, `${recipe.servings} حصص`) : recipe.cuisineName} width={width}
      onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} />)}</RecipeGrid>
    {visible.length > limit && <Button label={copy(`Load more (${visible.length - limit} left)`, `تحميل المزيد (${visible.length - limit})`)} variant="secondary" onPress={() => setLimit(limit + 24)} />}
  </ConnectedScreen>;
}
export function ConnectedRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const identity = useKitchenIdentity(); return <RecipeContent key={`${identity}:${id}`}  id={id} />;
}
function RecipeContent({ id }: { id: string }) {
  const copy = useCopy(); const { colors } = useRemyTheme(); const state = useKitchenData(() => loadRecipe(id)); const recipe = state.data; const [servings, setServings] = useState<number | null>(null);
  const matches = useBackendRecipes(); const { owner, ensureDetail } = matches; const { language } = useLanguage(); const insets = useSafeAreaInsets();
  const goal = useNutritionGoal(!!owner);
  const [scrolled, setScrolled] = useState(false); const reduced = useReducedMotion();
  const barStyle = useAnimatedStyle(() => ({ opacity: withTiming(scrolled ? 1 : 0, { duration: reduced ? 0 : 160 }) }));
  useFocusEffect(useCallback(() => { if (owner) void ensureDetail(id); }, [owner, ensureDetail, id]));
  const detail = matches.detail?.id === id ? matches.detail : null;
  const labels = backendRecipeMessages[language];
  const action = useAction(); const shoppingKeys = useRef(new Map<string, string>()); const listCreation = useRef<string | null>(null); const [date, setDate] = useState(todayKey); const [planning, setPlanning] = useState(false); const [sourcesOpen, setSourcesOpen] = useState(false);
  const count = servings ?? recipe?.servings ?? 1; const metadata = recipe ? getCookbookContent(recipe.name, recipe.id) : undefined;
  const addToList = async () => {
    if (!recipe) return;
    let list: ShoppingList | undefined = (await loadShopping()).find(entry => entry.status === 'ACTIVE');
    if (!listCreation.current) listCreation.current = operationKey();
    if (!list) list = (await kitchenRequest<{ createShoppingList: ShoppingList }>('mutation NewList($input: CreateShoppingListInputType!) { createShoppingList(input: $input) { id name status items { id foodId foodName quantity unit status } } }', { input: { name: 'Kitchen shopping', idempotencyKey: listCreation.current } })).createShoppingList;
    for (const ingredient of recipe.ingredients.filter(entry => !entry.optional)) {
      const signature = `${id}:${count}:${list.id}:${ingredient.id}`; let key = shoppingKeys.current.get(signature);
      if (!key) { key = operationKey(); shoppingKeys.current.set(signature, key); }
      await kitchenRequest('mutation AddIngredient($input: AddToShoppingListInputType!) { addToShoppingList(input: $input) { id } }', { input: { shoppingListId: list.id, foodId: ingredient.foodId, quantity: scaleQuantity(ingredient.quantity, count, recipe.servings), unit: ingredient.unit, idempotencyKey: key } });
    }
  };
  if (!recipe) return <ConnectedScreen title={copy('Recipe', 'الوصفة')}><DataNotice {...state} /></ConnectedScreen>;
  const rtl = language === 'ar'; const minutes = recipeMinutes(recipe); const heroHeight = (metadata ? 300 : 220) + insets.top;
  const difficulty = ({ EASY: copy('Easy', 'سهلة'), MEDIUM: copy('Medium', 'متوسطة'), HARD: copy('Hard', 'صعبة') } as Record<string, string>)[recipe.difficulty] ?? recipe.difficulty.toLowerCase();
  const stats: { icon: IconName; value: string; label: string }[] = [
    { icon: 'clock', value: minutes === null ? '—' : String(minutes), label: copy('min', 'دقيقة') },
    { icon: 'food', value: String(recipe.ingredients.length), label: copy('ingredients', 'مكونات') },
    { icon: 'manual', value: String(recipe.steps.length), label: copy('steps', 'خطوات') },
    { icon: 'info', value: difficulty, label: copy('level', 'المستوى') },
  ];
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} style={{ direction: rtl ? 'rtl' : 'ltr' }} scrollEventThrottle={32}
      onScroll={event => { const past = event.nativeEvent.contentOffset.y > heroHeight - insets.top - 72; if (past !== scrolled) setScrolled(past); }}>
      <RecipeArt id={recipe.id} name={recipe.name} width="100%" height={heroHeight} radius={0} />
      <View style={{ marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 10, gap: spacing.xl }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
        {matches.removedNotice?.recipeId === id && <AppText accessibilityLiveRegion="polite">{cookedItMessages[language].removed}</AppText>}
        <View style={[uiStyles.row, { alignItems: 'flex-start' }]}>
          <View style={[uiStyles.grow, { gap: 4 }]}><AppText variant="title" accessibilityRole="header" dir="ltr" style={{ fontSize: 28, lineHeight: 33 }}>{recipe.name}</AppText>
            {recipe.cuisineName && <AppText muted>{recipe.cuisineName}</AppText>}</View>
          <View style={[uiStyles.row, { gap: 8, paddingTop: 2 }]}>
            <RoundButton label="−" accessibilityLabel={copy('Fewer servings', 'حصص أقل')} disabled={count <= 1} onPress={() => setServings(count - 1)} />
            <View accessible accessibilityLabel={copy(`${count} servings`, `${count} حصص`)} style={{ alignItems: 'center', minWidth: 28 }}><AppText variant="heading" accessibilityLiveRegion="polite">{count}</AppText><AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 13 }}>{copy('serv.', 'حصص')}</AppText></View>
            <RoundButton label="+" accessibilityLabel={copy('More servings', 'حصص أكثر')} disabled={count >= 20} onPress={() => setServings(count + 1)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {stats.map(stat => <View key={stat.icon} accessible accessibilityLabel={`${stat.value} ${stat.label}`} style={{ flex: 1, alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: 14, borderRadius: radii.pill, backgroundColor: colors.hero }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}><Icon name={stat.icon} size={20} color={colors.text} /></View>
            <AppText variant="label" numberOfLines={1} style={{ color: colors.onHero }}>{stat.value}</AppText>
            <AppText variant="caption" numberOfLines={1} style={{ color: colors.onHero, fontSize: 12, lineHeight: 15 }}>{stat.label}</AppText>
          </View>)}
        </View>
        {detail?.matchingError && <Card><AppText accessibilityRole="alert">{labels.matchingError}</AppText><Button label={labels.retry} onPress={() => { void matches.loadDetail(id); }} /></Card>}
        {!!detail?.suggestion?.safetyWarnings.length && <Card style={{ backgroundColor: colors.warningSurface }}><AppText variant="label" style={{ color: colors.warningText }}>{labels.warnings}</AppText><AppText>{labels.warningBody}</AppText>{detail.suggestion.safetyWarnings.map(code => <AppText key={code}>{(labels as Record<string, string>)[code] ?? labels.otherWarning}</AppText>)}</Card>}
        {!!recipe.description && <AppText>{getCookbookContent(recipe.name, recipe.id) ? recipe.description.split('\n\n')[0] : recipe.description}</AppText>}
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading" accessibilityRole="header">{copy('Ingredients', 'المكونات')}</AppText>
          {recipe.ingredients.map(ingredient => <View key={ingredient.id} style={[uiStyles.row, { alignItems: 'flex-start' }]}>
            <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 7, backgroundColor: colors.accent }} />
            <View style={[uiStyles.grow, { gap: 2 }]}>
              <AppText><AppText variant="label">{formatAmount(scaleQuantity(ingredient.quantity, count, recipe.servings))} {unitLabel(ingredient.unit)}</AppText>  {recipeFoodName(ingredient, language)}{ingredient.optional && !detail?.suggestion ? copy(' · optional', ' · اختياري') : ''}</AppText>
              {detail?.suggestion && <AppText variant="caption" muted>{recipeIngredientStatus(ingredient, detail.suggestion, language)}</AppText>}
            </View>
          </View>)}
        </View>
        <NutritionPanel nutrition={recipe.nutrition} language={language} goal={goal} />
        <View style={{ gap: spacing.md }}>
          <AppText variant="heading" accessibilityRole="header">{copy('Directions', 'طريقة التحضير')}</AppText>
          {[...recipe.steps].sort((a, b) => a.stepNumber - b.stepNumber).map(step => <View key={step.id} style={[uiStyles.row, { alignItems: 'flex-start' }]}>
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSurface }}><AppText variant="label" style={{ color: colors.selectedText, fontSize: 13 }}>{step.stepNumber}</AppText></View>
            <View style={[uiStyles.grow, { gap: 4, paddingTop: 3 }]}><AppText dir="ltr">{step.instruction}</AppText>{step.durationMin !== null && <View style={[uiStyles.row, { gap: 6 }]}><Icon name="clock" size={14} color={colors.textSecondary} /><AppText variant="caption" muted>{step.durationMin} {copy('min', 'دقيقة')}</AppText></View>}</View>
          </View>)}
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button label={copy('Add ingredients to shopping', 'إضافة المكونات للمشتريات')} icon="shopping" variant="secondary" disabled={action.busy} onPress={() => { void action.run(addToList, copy('Ingredients added. Find them in Shopping.', 'أُضيفت المكونات إلى المشتريات.')); }} />
          <Button label={copy('Add to meal plan', 'إضافة إلى خطة الوجبات')} icon="calendar" variant="secondary" onPress={() => setPlanning(!planning)} />
          {planning && <Card><FormField label={copy('Date (YYYY-MM-DD)', 'التاريخ (YYYY-MM-DD)')} value={date} onChangeText={setDate} autoCorrect={false} /><Button label={copy('Choose meal and save', 'اختر الوجبة واحفظ')} disabled={action.busy} onPress={() => router.push({ pathname: '/feature', params: { feature: 'planner', recipeId: id, date, servings: String(count) } })} /></Card>}
          <Button label={cookedItMessages[language].cooked} variant="text" onPress={() => router.push({ pathname: '/cooked-it', params: { id, servings: String(count) } })} />
          {metadata && <Button label={copy('Recipe sources & image credits', 'مصادر الوصفة والصورة')} variant="text" onPress={() => setSourcesOpen(!sourcesOpen)} />}
          {metadata && sourcesOpen && <><AppText variant="caption">{metadata.adaptationNote}</AppText><Button label={`${copy('Recipe source', 'مصدر الوصفة')}: ${metadata.sourceLabel}`} variant="text" onPress={() => { void Linking.openURL(metadata.sourceUrl); }} /><AppText variant="caption" muted>{metadata.imageCredit}</AppText>{metadata.allergens.length > 0 && <AppText>{copy('Contains', 'تحتوي على')}: {metadata.allergens.join(', ')}</AppText>}</>}
          <Feedback message={action.message} />
        </View>
      </View>
    </ScrollView>
    {/* Once the picture has scrolled away, a plain bar keeps text out from under the status bar and names the recipe. */}
    <Animated.View pointerEvents="none" style={[barStyle, { position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 60, paddingTop: insets.top, paddingHorizontal: 76, justifyContent: 'center', backgroundColor: colors.background, borderBottomWidth: 1, borderColor: colors.divider }]}>
      <AppText variant="label" numberOfLines={1} dir="ltr" style={{ textAlign: 'center' }}>{recipe.name}</AppText></Animated.View>
    <Pressable accessibilityRole="button" accessibilityLabel={copy('Back', 'رجوع')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={6}
      style={({ pressed }) => ({ position: 'absolute', top: insets.top + 8, [rtl ? 'right' : 'left']: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}>
      <Icon name="back" size={20} color={colors.text} rtl={rtl} /></Pressable>
    <View style={{ paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.divider }}>
      <Button label={copy('Start cooking', 'ابدأ الطبخ')} onPress={() => router.push({ pathname: '/cooking/[id]', params: { id, servings: String(count) } })} />
    </View>
  </View>;
}
export { BackendCookingScreen as ConnectedCookingScreen } from './backend-cooking-screen';
export { recipeDetailFields };
