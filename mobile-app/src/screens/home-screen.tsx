import { BackendHomeRecipeIdeas } from './backend-home-recipe-ideas';
import { ingredientImage } from '@/data/ingredient-images';
import { useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
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
import { loadRecipes, loadPlans, todayKey } from '@/services/kitchen-api';
import { DataNotice, useKitchenData } from './connected-ui';
import { useCallback } from 'react';
export interface BackendHomeData { recipeIdeas?: ReactNode; items: import('@/domain/backend-inventory-read-model').InventoryReadItem[]; status: string; today: string; retry: () => Promise<void>; notice: ReactNode; deviceNotice: ReactNode; saved: string; empty: string; emptyBody: string; writesSoon: string; readOnly: string; foodName: (item: import('@/domain/backend-inventory-read-model').InventoryReadItem) => string; quantityLabel: (item: import('@/domain/backend-inventory-read-model').InventoryReadItem) => string }
const feature = (name: string) => router.push({ pathname: '/feature', params: { feature: name } });
export default function HomeScreen(_props: { backend?: BackendHomeData } = {}) {
  const { colors, mode } = useRemyTheme(); const { language } = useLanguage(); const { user } = useAuth(); const kitchen = useBackendKitchen();
  const rtl = language === 'ar'; const c = (en: string, ar: string) => rtl ? ar : en;
  const [query, setQuery] = useState('');
  const data = useKitchenData(async () => ({ recipes: await loadRecipes(), plans: await loadPlans(todayKey(), todayKey()) }));
  const reload = data.reload;
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const recipes = (data.data?.recipes ?? []).filter(recipe => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const foods = kitchen.items.filter(item => backendFoodName(item, language).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const priority = kitchen.items.filter(item => { const days = backendExpiryDays(item, kitchen.today); return days !== null && days >= 0 && days <= 3; }).sort((a,b) => (backendExpiryDays(a,kitchen.today) ?? 99) - (backendExpiryDays(b,kitchen.today) ?? 99));
  const meals = (data.data?.plans ?? []).flatMap(plan => plan.meals).filter(meal => meal.mealDate === todayKey());
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
      <Card><SectionHeader title={c("Today's plan", 'خطة اليوم')} />{meals.length ? meals.map(meal => <Button key={meal.id} label={meal.recipeName} variant="text" onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: meal.recipeId } })} />) : <AppText muted>{c('A little room for something good.', 'مساحة لوجبة لذيذة.')}</AppText>}<Button label={c('Plan a meal', 'خطط لوجبة')} variant="secondary" onPress={() => router.navigate('/plan')} /></Card>
      <View style={{ padding: 20, gap: 12, backgroundColor: '#35532B', borderRadius: 16 }}><AppText variant="heading" style={{ color: '#FFF7E8' }}>{c('Make more of what you have.', 'استفد أكثر مما لديك.')}</AppText><Button label={c('Kitchen helper', 'مساعد المطبخ')} variant="secondary" icon="chat" onPress={() => feature('chat')} /><Button label={c('Your shopping list', 'قائمة مشترياتك')} variant="secondary" icon="shopping" onPress={() => feature('shopping')} /></View>
    </>}
  </Screen>;
}
