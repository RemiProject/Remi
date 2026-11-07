import { useLanguage } from '@/providers/language-provider';
import { useBackendRecipes } from '@/providers/backend-recipes-provider';
import { recipeFoodName, recipeIngredientStatus } from '@/utils/backend-recipe-view';
import { backendRecipeMessages } from '@/i18n/backend-recipes';
import { cookedItMessages } from '@/i18n/cooked-it';
import { BackendRecipesScreen } from './backend-recipes-screen';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Linking, Pressable, View } from 'react-native';
import { AppText, Button, Card, Chip, EmptyState, SearchField, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { getCookbookContent } from '@/data/cookbook-content';
import { kitchenRequest, loadRecipe, loadRecipes, loadShopping, operationKey, recipeDetailFields, scaleQuantity, todayKey, unitLabel, type ShoppingList } from '@/services/kitchen-api';
import { ConnectedScreen, DataNotice, Feedback, useAction, useCopy, useKitchenData, useKitchenIdentity } from './connected-ui';

function RecipePicture({ name, id, height = 180 }: { name: string; id: string; height?: number }) {
  const content = getCookbookContent(name, id);
  return content ? <Image source={content.image} accessibilityLabel={name} contentFit="cover" style={{ width: '100%', height, borderRadius: 16 }} /> : null;
}
export function ConnectedRecipesScreen() {
  const [catalogue, setCatalogue] = useState(false);
  return catalogue ? <CatalogueScreen onSuggestions={() => setCatalogue(false)} /> : <BackendRecipesScreen onBrowseAll={() => setCatalogue(true)} />;
}
function CatalogueScreen({ onSuggestions }: { onSuggestions: () => void }) {
  const copy = useCopy(); const state = useKitchenData(loadRecipes); const [query, setQuery] = useState(''); const [quick, setQuick] = useState(false); const [limit, setLimit] = useState(20);
  const visible = (state.data ?? []).filter(recipe => recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!quick || (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0) <= 30));
  return <ConnectedScreen title={copy('The cookbook', 'كتاب الطبخ')}><SearchField value={query} onChangeText={value => { setQuery(value); setLimit(20); }} placeholder={copy('Find a recipe', 'ابحث عن وصفة')} />
    <View style={uiStyles.wrap}><Chip label={copy('All recipes', 'كل الوصفات')} selected={!quick} onPress={() => setQuick(false)} /><Chip label={copy('Under 30 min', 'أقل من ٣٠ دقيقة')} selected={quick} onPress={() => setQuick(!quick)} /><Chip label={copy('From my kitchen', 'من مطبخي')} selected={false} onPress={onSuggestions} /></View>
    <DataNotice {...state} />
    {!state.loading && state.data && !visible.length && <EmptyState title={copy('No recipes found', 'لم نجد وصفات')} description={copy('Try another search or clear your filters.', 'جرّب بحثًا آخر أو امسح عوامل التصفية.')} action={copy('Clear filters', 'مسح التصفية')} onPress={() => { setQuery(''); setQuick(false); }} />}
    {visible.slice(0, limit).map(recipe => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={recipe.name} onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })}><Card><RecipePicture name={recipe.name} id={recipe.id} /><AppText variant="heading">{recipe.name}</AppText><AppText muted>{(recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0)} {copy('min', 'دقيقة')} · {recipe.servings} {copy('servings', 'حصص')}</AppText><AppText>{getCookbookContent(recipe.name, recipe.id) ? recipe.description?.split('\n\n')[0] : recipe.description}</AppText></Card></Pressable>)}
    {visible.length > limit && <Button label={copy('Load more recipes', 'تحميل المزيد من الوصفات')} variant="secondary" onPress={() => setLimit(limit + 20)} />}
  </ConnectedScreen>;
}
export function ConnectedRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const identity = useKitchenIdentity(); return <RecipeContent key={`${identity}:${id}`}  id={id} />;
}
function RecipeContent({ id }: { id: string }) {
  const copy = useCopy(); const state = useKitchenData(() => loadRecipe(id)); const recipe = state.data; const [servings, setServings] = useState<number | null>(null); const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');
  const matches = useBackendRecipes(); const { owner, ensureDetail } = matches; const { language } = useLanguage();
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
  return <ConnectedScreen title={recipe?.name ?? copy('Recipe', 'الوصفة')} footer={recipe ? <Button label={copy('Start cooking', 'ابدأ الطبخ')} onPress={() => router.push({ pathname: '/cooking/[id]', params: { id, servings: String(count) } })} /> : undefined}><DataNotice {...state} />{recipe && <>
    {matches.removedNotice?.recipeId === id && <AppText accessibilityLiveRegion="polite">{cookedItMessages[language].removed}</AppText>}
    <RecipePicture name={recipe.name} id={recipe.id} height={250} />
    {detail?.matchingError && <Card><AppText accessibilityRole="alert">{labels.matchingError}</AppText><Button label={labels.retry} onPress={() => { void matches.loadDetail(id); }} /></Card>}
    {!!detail?.suggestion?.safetyWarnings.length && <Card><AppText variant="label">{labels.warnings}</AppText><AppText>{labels.warningBody}</AppText>{detail.suggestion.safetyWarnings.map(code => <AppText key={code}>{(labels as Record<string, string>)[code] ?? labels.otherWarning}</AppText>)}</Card>}
    <Button label={cookedItMessages[language].cooked} variant="secondary" onPress={() => router.push({ pathname: '/cooked-it', params: { id, servings: String(count) } })} /><AppText>{getCookbookContent(recipe.name, recipe.id) ? recipe.description?.split('\n\n')[0] : recipe.description}</AppText><AppText muted>{(recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0)} {copy('minutes', 'دقيقة')} · {recipe.difficulty.toLowerCase()}</AppText>

    <View style={uiStyles.row}><Button label="−" variant="secondary" disabled={count <= 1} onPress={() => setServings(count - 1)} /><AppText>{count} {copy('servings', 'حصص')}</AppText><Button label="+" variant="secondary" disabled={count >= 20} onPress={() => setServings(count + 1)} /></View>
    <View style={uiStyles.wrap}><Chip label={copy('Ingredients', 'المكونات')} selected={tab === 'ingredients'} onPress={() => setTab('ingredients')} /><Chip label={copy('Steps', 'الخطوات')} selected={tab === 'steps'} onPress={() => setTab('steps')} /></View>
    {tab === 'ingredients' ? recipe.ingredients.map(ingredient => <Card key={ingredient.id}><AppText variant="label">{recipeFoodName(ingredient, language)}{ingredient.optional ? copy(' · optional', ' · اختياري') : ''}</AppText><AppText>{scaleQuantity(ingredient.quantity, count, recipe.servings)} {unitLabel(ingredient.unit)}</AppText>{detail?.suggestion && <AppText variant="caption" muted>{recipeIngredientStatus(ingredient, detail.suggestion, language)}</AppText>}</Card>) : recipe.steps.map(step => <Card key={step.id}><AppText variant="heading">{step.stepNumber}</AppText><AppText>{step.instruction}</AppText>{step.durationMin !== null && <AppText muted>{step.durationMin} {copy('minutes', 'دقيقة')}</AppText>}</Card>)}
    <Button label={copy('Add ingredients to shopping', 'إضافة المكونات للمشتريات')} variant="secondary" disabled={action.busy} onPress={() => { void action.run(addToList, copy('Ingredients added. Find them in Shopping.', 'أُضيفت المكونات إلى المشتريات.')); }} />
    <Button label={copy('Add to meal plan', 'إضافة إلى خطة الوجبات')} variant="secondary" onPress={() => setPlanning(!planning)} />
    {planning && <Card><FormField label={copy('Date (YYYY-MM-DD)', 'التاريخ (YYYY-MM-DD)')} value={date} onChangeText={setDate} autoCorrect={false} /><Button label={copy('Choose meal and save', 'اختر الوجبة واحفظ')} disabled={action.busy} onPress={() => router.push({ pathname: '/feature', params: { feature: 'planner', recipeId: id, date, servings: String(count) } })} /></Card>}
    {metadata && <Button label={copy('Recipe sources & image credits', 'مصادر الوصفة والصورة')} variant="text" onPress={() => setSourcesOpen(!sourcesOpen)} />}
    {metadata && sourcesOpen && <><AppText variant="caption">{metadata.adaptationNote}</AppText><Button label={`${copy('Recipe source', 'مصدر الوصفة')}: ${metadata.sourceLabel}`} variant="text" onPress={() => { void Linking.openURL(metadata.sourceUrl); }} /><AppText variant="caption" muted>{metadata.imageCredit}</AppText>{metadata.allergens.length > 0 && <AppText>{copy('Contains', 'تحتوي على')}: {metadata.allergens.join(', ')}</AppText>}</>}
    <Feedback message={action.message} />
  </>}</ConnectedScreen>;
}
export { BackendCookingScreen as ConnectedCookingScreen } from './backend-cooking-screen';
export { recipeDetailFields };
