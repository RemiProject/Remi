import { recipeName, recipeNameMatches } from '@/i18n/recipe-names';
import { RecipeArt, RecipeCard, RecipeGrid, RecipeTabs, filterRecipes, recipeMinutes, recipeTabs, useGridCardWidth } from '@/components/recipe-card';
import { energyLabel } from '@/domain/nutrition';
import { Brand } from '@/components/brand';
import { radii, spacing } from '@/theme/tokens';
import { AppSkeleton } from '@/components/app-skeleton';
import { BackendHomeRecipeIdeas } from './backend-home-recipe-ideas';
import { ingredientImage } from '@/data/ingredient-images';
import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { AppText, Button, Card, Screen, SearchField, SectionHeader, uiStyles } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { useAuth } from '@/providers/auth-provider';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { backendExpiryDays, backendFoodName, backendQuantityLabel } from '@/utils/backend-kitchen-view';
import { getCookbookContent } from '@/data/cookbook-content';
import { loadRecipe, loadRecipes, loadPlans, loadShopping, shiftDay, todayKey } from '@/services/kitchen-api';
import { addPlannedMealsToShopping } from '@/services/plan-shopping';
import { recipesOnList, upcomingMeals } from '@/domain/home-plan';
import { DataNotice, Feedback, useAction, useKitchenData } from './connected-ui';
export interface BackendHomeData { recipeIdeas?: ReactNode; items: import('@/domain/backend-inventory-read-model').InventoryReadItem[]; status: string; today: string; retry: () => Promise<void>; notice: ReactNode; deviceNotice: ReactNode; saved: string; empty: string; emptyBody: string; writesSoon: string; readOnly: string; foodName: (item: import('@/domain/backend-inventory-read-model').InventoryReadItem) => string; quantityLabel: (item: import('@/domain/backend-inventory-read-model').InventoryReadItem) => string }
const feature = (name: string) => router.push({ pathname: '/feature', params: { feature: name } });
export default function HomeScreen(_props: { backend?: BackendHomeData } = {}) {
  const { colors } = useRemyTheme(); const { language } = useLanguage(); const { user } = useAuth(); const kitchen = useBackendKitchen();
  const rtl = language === 'ar'; const c = (en: string, ar: string) => rtl ? ar : en;
  const [query, setQuery] = useState(''); const [tab, setTab] = useState('for-you');
  const data = useKitchenData(async () => {
    const today = todayKey();
    const [recipes, plans, lists] = await Promise.all([loadRecipes(), loadPlans(today, shiftDay(today, 6)), loadShopping()]);
    const upcoming = upcomingMeals(plans.flatMap(plan => plan.meals), today);
    // One recipe failing to load only hides it from the list card; Home itself still renders.
    const details = (await Promise.all([...new Set(upcoming.map(meal => meal.recipeId))].map(id => loadRecipe(id).catch(() => null)))).filter(recipe => recipe !== null);
    return { recipes, upcoming, onList: recipesOnList(details, lists.filter(list => list.status === 'ACTIVE').flatMap(list => list.items)) };
  });
  const shop = useAction(data.reload); const [shopNote, setShopNote] = useState<string | null>(null);
  const addUpcoming = () => shop.run(async () => {
    const result = await addPlannedMealsToShopping(kitchen.status === 'ready' ? kitchen.items.map(item => ({ foodId: item.foodId, quantity: item.quantity, unit: item.backendUnit })) : []);
    setShopNote(result.added.length ? c(`Added ${result.added.length === 1 ? '1 ingredient' : `${result.added.length} ingredients`} to your shopping list.`, `المكونات المضافة إلى قائمة مشترياتك: ${result.added.length}.`) : c('Everything you need is already in Kitchen or on your list.', 'كل ما تحتاجه موجود في المطبخ أو في قائمتك.'));
  });
  const dayLabel = (date: string) => date === todayKey() ? c('Today', 'اليوم') : date === shiftDay(todayKey(), 1) ? c('Tomorrow', 'غدًا') : new Date(`${date}T12:00:00`).toLocaleDateString(language, { weekday: 'long' });
  const mealLabel = (type: string) => ({ BREAKFAST: c('Breakfast', 'الإفطار'), LUNCH: c('Lunch', 'الغداء'), DINNER: c('Dinner', 'العشاء'), SNACK: c('Snack', 'وجبة خفيفة') } as Record<string, string>)[type] ?? c('Meal', 'وجبة');
  const thumb = (name: string, id: string) => <RecipeArt id={id} name={name} width={56} height={56} radius={14} />;
  const row = (key: string, title: string, caption: string, onPress: () => void, recipeId?: string) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${recipeName(title, language)}. ${caption}`} onPress={onPress} style={({ pressed }) => [uiStyles.row, { paddingVertical: 8, borderRadius: 16, backgroundColor: pressed ? colors.pressedSurface : 'transparent' }]}>
    {recipeId && thumb(title, recipeId)}<View style={{ flex: 1, gap: 2 }}><AppText variant="label">{recipeName(title, language)}</AppText><AppText variant="caption" muted>{caption}</AppText></View><Icon name="chevron" size={16} rtl={rtl} /></Pressable>;
  const catalogue = [...(data.data?.recipes ?? [])].sort((a, b) => Number(!!getCookbookContent(b.name, b.id)) - Number(!!getCookbookContent(a.name, a.id)));
  const recipes = catalogue.filter(recipe => recipeNameMatches(recipe.name, query, language));
  const shown = filterRecipes(catalogue, tab); const cardWidth = useGridCardWidth();
  const foods = kitchen.items.filter(item => backendFoodName(item, language).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const priority = kitchen.items.filter(item => { const days = backendExpiryDays(item, kitchen.today); return days !== null && days >= 0 && days <= 3; }).sort((a,b) => (backendExpiryDays(a,kitchen.today) ?? 99) - (backendExpiryDays(b,kitchen.today) ?? 99));
  const upcoming = data.data?.upcoming ?? []; const onList = data.data?.onList ?? [];
  if (user && (kitchen.status === 'loading' && !kitchen.items.length || data.loading && !data.data)) return <AppSkeleton navigation={false} />;
  const time = (recipe: { prepTimeMin: number | null; cookTimeMin: number | null }) => { const m = recipeMinutes(recipe); return m === null ? null : `${m} ${c('min', 'دقيقة')}`; };
  const card = (recipe: (typeof catalogue)[number]) => <RecipeCard key={recipe.id} id={recipe.id} name={recipe.name} time={time(recipe)} energy={energyLabel(recipe.nutrition, language)} caption={tab.startsWith('cuisine:') || !recipe.cuisineName ? c(`${recipe.servings} servings`, `${recipe.servings} حصص`) : recipe.cuisineName} width={cardWidth} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} />;
  const browse = (key: string) => router.push({ pathname: '/feature', params: key === 'for-you' ? { feature: 'recipes' } : { feature: 'recipes', browse: key } });
  return <Screen rtl={rtl} contentGap={28}>
    <View style={{ backgroundColor: colors.hero, marginHorizontal: -20, marginTop: -20, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
      <View style={uiStyles.row}><View style={{ flex: 1 }}><Brand kind="wordmark" height={32} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel={c('Your account', 'حسابك')} onPress={() => feature('profile')} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}><Icon name="profile" size={22} color={colors.text} /></Pressable></View>
      <View style={[uiStyles.row, { alignItems: 'flex-end', marginVertical: -spacing.sm }]}><AppText variant="title" accessibilityRole="header" style={{ fontSize: 36, lineHeight: 40, color: colors.onHero, flex: 1 }}>{c('A good day\nto cook.', 'يوم جميل\nللطبخ.')}</AppText><Brand kind="mascot" height={104} /></View>
      <SearchField value={query} onChangeText={setQuery} placeholder={c('Search food or recipes', 'ابحث عن طعام أو وصفة')} autoCorrect={false} />
    </View>
    {!user ? <Card><AppText variant="heading">{c('Your kitchen, all together.', 'مطبخك في مكان واحد.')}</AppText><AppText>{c('Keep track of what you have, cook something good, and plan a little ahead.', 'تابع طعامك وحضّر وجباتك وخطط للأيام القادمة.')}</AppText><Button label={c('Sign in to your kitchen', 'تسجيل الدخول إلى مطبخك')} onPress={() => router.push('/login')} /><Button label={c('Create an account', 'إنشاء حساب')} variant="text" onPress={() => router.push('/signup')} /></Card> : <>
      <DataNotice {...data} />
      {kitchen.status === 'error' && <Card><AppText accessibilityRole="alert">{c('Could not load your kitchen.', 'تعذّر تحميل مطبخك.')}</AppText><Button label={c('Try again', 'حاول مجددًا')} onPress={() => { void kitchen.retry(); }} /></Card>}
      {query.trim() ? <>
        <SectionHeader title={c('Your food', 'طعامك')} />{foods.map(item => <Button key={item.id} label={`${backendFoodName(item, language)} · ${backendQuantityLabel(item, language)}`} variant="secondary" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })} />)}{!foods.length && <AppText muted>{c('No matching food.', 'لا يوجد طعام مطابق.')}</AppText>}
        <SectionHeader title={c('Recipes', 'الوصفات')} action={c('See all', 'عرض الكل')} onPress={() => browse('all')} />
        <RecipeGrid>{recipes.slice(0, 10).map(card)}</RecipeGrid>
        {!data.loading && !recipes.length && <AppText muted>{c('No recipes match yet. Try another search.', 'لا توجد وصفات مطابقة. جرّب بحثًا آخر.')}</AppText>}
      </> : <>
        {/* Use first: a slim strip; the food rows appear only when something is due within 3 days. */}
        <Pressable accessibilityRole="button" accessibilityLabel={`${c('Use first', 'استخدم أولاً')}. ${kitchen.items.length ? c('View your food', 'عرض طعامك') : c('Add your first ingredient', 'أضف أول مكوّن')}`} onPress={() => router.navigate(kitchen.items.length ? '/kitchen' : '/food/manual')}
          style={({ pressed }) => ({ backgroundColor: colors.accentSoft, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, gap: 10, opacity: pressed ? 0.85 : 1 })}>
          <View style={uiStyles.row}><View style={{ flex: 1, gap: 2 }}><AppText variant="label" style={{ color: colors.accentText }}>{c('Use first', 'استخدم أولاً')}</AppText>
            <AppText variant="caption" style={{ color: colors.text }}>{priority.length ? (priority.length === 1 ? c('1 ingredient to use soon', 'مكوّن واحد للاستخدام قريبًا') : c(`${priority.length} ingredients to use soon`, `${priority.length} مكونات للاستخدام قريبًا`)) : kitchen.items.length ? c('Nothing needs using in the next 3 days.', 'لا شيء يحتاج إلى استخدام خلال ٣ أيام.') : c('Add your first ingredient', 'أضف أول مكوّن')}</AppText></View>
            <Icon name="chevron" size={16} color={colors.accentText} rtl={rtl} /></View>
          {priority.slice(0, 2).map(item => <View key={item.id} style={uiStyles.row}>{ingredientImage(item.name) && <Image source={ingredientImage(item.name)} contentFit="cover" style={{ width: 36, height: 36, borderRadius: radii.sm }} />}<AppText variant="label" style={{ flex: 1 }}>{backendFoodName(item, language)} · {backendQuantityLabel(item, language)}</AppText></View>)}
          {priority.length > 0 && <AppText variant="caption" muted>{c('Based on dates you entered. Check food before use.', 'حسب التواريخ المسجلة. افحص الطعام قبل الاستخدام.')}</AppText>}
        </Pressable>
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title={c('Recipes', 'الوصفات')} action={c('See all', 'عرض الكل')} onPress={() => browse(tab)} />
          <RecipeTabs tabs={[{ key: 'for-you', label: c('For you', 'لك') }, ...recipeTabs(catalogue, c)]} value={tab} onChange={setTab} rtl={rtl} />
          {tab === 'for-you' ? <BackendHomeRecipeIdeas kitchenStatus={kitchen.status} title={c('Tonight, sorted.', 'وجبة الليلة جاهزة.')} header={false} limit={6} />
            : <View style={{ gap: spacing.lg }}><RecipeGrid>{shown.slice(0, 10).map(card)}</RecipeGrid>
              {shown.length > 10 && <Button label={c(`See all ${shown.length} recipes`, `عرض كل الوصفات (${shown.length})`)} variant="secondary" onPress={() => browse(tab)} />}</View>}
        </View>
      </>}
      <Card><SectionHeader title={c('Upcoming meals', 'الوجبات القادمة')} />
        {upcoming.length ? upcoming.map(meal => row(meal.id, meal.recipeName, `${dayLabel(meal.mealDate)} · ${mealLabel(meal.mealType)} · ${Number(meal.servings)} ${c('servings', 'حصص')}`, () => router.push({ pathname: '/recipes/[id]', params: { id: meal.recipeId } }), meal.recipeId)) : <AppText muted>{c('A little room for something good.', 'مساحة لوجبة لذيذة.')}</AppText>}
        {upcoming.length > 0 && <Button label={c('Add ingredients to shopping list', 'أضف المكونات إلى قائمة المشتريات')} icon="shopping" disabled={shop.busy} onPress={() => { void addUpcoming(); }} />}
        <Feedback message={shop.message ?? shopNote} />
        <Button label={c('Plan a meal', 'خطط لوجبة')} variant="secondary" onPress={() => router.navigate('/plan')} /></Card>
      {onList.length > 0 && <Card><SectionHeader title={c('In your shopping list', 'في قائمة مشترياتك')} action={c('View list', 'عرض القائمة')} onPress={() => feature('shopping')} />
        {onList.map(recipe => row(recipe.id, recipe.name, c(`${recipe.onList} of ${recipe.total} ingredients on your list`, `${recipe.onList} من ${recipe.total} مكونات في قائمتك`), () => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } }), recipe.id))}</Card>}
    </>}
  </Screen>;
}
