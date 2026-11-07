import { AppSkeleton } from '@/components/app-skeleton';
import { BackendHomeRecipeIdeas } from './backend-home-recipe-ideas';
import { ingredientImage } from '@/data/ingredient-images';
import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
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
  const { colors, mode } = useRemyTheme(); const { language } = useLanguage(); const { user } = useAuth(); const kitchen = useBackendKitchen();
  const rtl = language === 'ar'; const c = (en: string, ar: string) => rtl ? ar : en;
  const [query, setQuery] = useState('');
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
  const row = (key: string, title: string, caption: string, onPress: () => void) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${title}. ${caption}`} onPress={onPress} style={({ pressed }) => [uiStyles.row, { paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? colors.pressedSurface : 'transparent' }]}>
    <View style={{ flex: 1, gap: 2 }}><AppText variant="label">{title}</AppText><AppText variant="caption" muted>{caption}</AppText></View><Icon name="chevron" size={16} rtl={rtl} /></Pressable>;
  const recipes = (data.data?.recipes ?? []).filter(recipe => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const foods = kitchen.items.filter(item => backendFoodName(item, language).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const priority = kitchen.items.filter(item => { const days = backendExpiryDays(item, kitchen.today); return days !== null && days >= 0 && days <= 3; }).sort((a,b) => (backendExpiryDays(a,kitchen.today) ?? 99) - (backendExpiryDays(b,kitchen.today) ?? 99));
  const upcoming = data.data?.upcoming ?? []; const onList = data.data?.onList ?? [];
  if (user && (kitchen.status === 'loading' && !kitchen.items.length || data.loading && !data.data)) return <AppSkeleton navigation={false} />;
  return <Screen rtl={rtl} contentGap={24}>
    <View style={{ backgroundColor: '#B92318', marginHorizontal: -20, marginTop: -20, padding: 24, paddingTop: 20, gap: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
      <View style={uiStyles.row}><AppText variant="brand" style={{ color: '#FFF7E8', flex: 1 }}>Remi</AppText><Button label={c('Your account', 'حسابك')} icon="profile" variant="secondary" onPress={() => feature('profile')} /></View>
      <AppText variant="title" style={{ fontSize: 40, lineHeight: 43, color: '#FFF7E8', maxWidth: 320 }}>{c('A good day\nto cook.', 'يوم جميل\nللطبخ.')}</AppText>
      <SearchField value={query} onChangeText={setQuery} placeholder={c('Search food or recipes', 'ابحث عن طعام أو وصفة')} autoCorrect={false} />
    </View>
    {!user ? <Card><AppText variant="heading">{c('Your kitchen, all together.', 'مطبخك في مكان واحد.')}</AppText><AppText>{c('Keep track of what you have, cook something good, and plan a little ahead.', 'تابع طعامك وحضّر وجباتك وخطط للأيام القادمة.')}</AppText><Button label={c('Sign in to your kitchen', 'تسجيل الدخول إلى مطبخك')} onPress={() => router.push('/login')} /><Button label={c('Create an account', 'إنشاء حساب')} variant="text" onPress={() => router.push('/signup')} /></Card> : <>
      <DataNotice {...data} />
      {kitchen.status === 'error' && <Card><AppText accessibilityRole="alert">{c('Could not load your kitchen.', 'تعذّر تحميل مطبخك.')}</AppText><Button label={c('Try again', 'حاول مجددًا')} onPress={() => { void kitchen.retry(); }} /></Card>}
      {query.trim() ? <><SectionHeader title={c('Your food', 'طعامك')} />{foods.map(item => <Button key={item.id} label={`${backendFoodName(item, language)} · ${backendQuantityLabel(item, language)}`} variant="secondary" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })} />)}{!foods.length && <AppText muted>{c('No matching food.', 'لا يوجد طعام مطابق.')}</AppText>}</> : <>
        <View style={{ backgroundColor: mode === 'dark' ? '#59431F' : '#F7CA51', borderRadius: 18, padding: 20, gap: 10 }}>
          <AppText variant="heading">{c('Use first', 'استخدم أولاً')}</AppText>
          <AppText>{priority.length ? c(`${priority.length} ingredients to use soon`, `${priority.length} مكونات للاستخدام قريبًا`) : c('A little care goes a long way.', 'الاهتمام البسيط يصنع فرقًا.')}</AppText>
          {priority.slice(0,2).map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })}><View style={uiStyles.row}>{ingredientImage(item.name) && <Image source={ingredientImage(item.name)} contentFit="contain" style={{ width: 54, height: 54 }} />}<AppText variant="label" style={{ flex: 1 }}>{backendFoodName(item, language)} · {backendQuantityLabel(item, language)}</AppText><Icon name="chevron" size={16} /></View></Pressable>)}
          <Button label={kitchen.items.length ? c('View your food', 'عرض طعامك') : c('Add your first ingredient', 'أضف أول مكوّن')} onPress={() => router.navigate(kitchen.items.length ? '/kitchen' : '/food/manual')} />
          <AppText variant="caption">{c('Based on dates you entered. Check food before use.', 'حسب التواريخ المسجلة. افحص الطعام قبل الاستخدام.')}</AppText>
        </View>
      </>}
      {!query.trim() && <BackendHomeRecipeIdeas kitchenStatus={kitchen.status} title={c('Tonight, sorted.', 'وجبة الليلة جاهزة.')} />}
      {!!query.trim() && <><SectionHeader title={c('Recipes', 'الوصفات')} action={c('See all', 'عرض الكل')} onPress={() => feature('recipes')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {recipes.slice(0,6).map(recipe => { const content = getCookbookContent(recipe.name, recipe.id); return <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={recipe.name} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} style={{ width: 290, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface }}>
          {content && <Image source={content.image} contentFit="cover" accessibilityLabel={recipe.name} style={{ height: 200, width: '100%' }} />}
          <View style={{ padding: 16, gap: 8 }}><AppText variant="heading">{rtl && content ? content.nameAr : recipe.name}</AppText><View style={uiStyles.row}><Icon name="clock" size={16} /><AppText variant="caption" muted>{(recipe.prepTimeMin ?? 0)+(recipe.cookTimeMin ?? 0)} {c('min', 'دقيقة')} · {recipe.servings} {c('servings', 'حصص')}</AppText></View></View>
        </Pressable>; })}
      </ScrollView>
      {!data.loading && !recipes.length && <AppText muted>{c('No recipes match yet. Try another search.', 'لا توجد وصفات مطابقة. جرّب بحثًا آخر.')}</AppText>}</>}
      <Card><SectionHeader title={c('Upcoming meals', 'الوجبات القادمة')} />
        {upcoming.length ? upcoming.map(meal => row(meal.id, meal.recipeName, `${dayLabel(meal.mealDate)} · ${mealLabel(meal.mealType)} · ${Number(meal.servings)} ${c('servings', 'حصص')}`, () => router.push({ pathname: '/recipes/[id]', params: { id: meal.recipeId } }))) : <AppText muted>{c('A little room for something good.', 'مساحة لوجبة لذيذة.')}</AppText>}
        {upcoming.length > 0 && <Button label={c('Add ingredients to shopping list', 'أضف المكونات إلى قائمة المشتريات')} icon="shopping" disabled={shop.busy} onPress={() => { void addUpcoming(); }} />}
        <Feedback message={shop.message ?? shopNote} />
        <Button label={c('Plan a meal', 'خطط لوجبة')} variant="secondary" onPress={() => router.navigate('/plan')} /></Card>
      {onList.length > 0 && <Card><SectionHeader title={c('In your shopping list', 'في قائمة مشترياتك')} action={c('View list', 'عرض القائمة')} onPress={() => feature('shopping')} />
        {onList.map(recipe => row(recipe.id, recipe.name, c(`${recipe.onList} of ${recipe.total} ingredients on your list`, `${recipe.onList} من ${recipe.total} مكونات في قائمتك`), () => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })))}</Card>}
      <View style={{ padding: 20, gap: 12, backgroundColor: '#35532B', borderRadius: 16 }}><AppText variant="heading" style={{ color: '#FFF7E8' }}>{c('Make more of what you have.', 'استفد أكثر مما لديك.')}</AppText><Button label={c('Kitchen helper', 'مساعد المطبخ')} variant="secondary" icon="chat" onPress={() => feature('chat')} /><Button label={c('Your shopping list', 'قائمة مشترياتك')} variant="secondary" icon="shopping" onPress={() => feature('shopping')} /></View>
    </>}
  </Screen>;
}
