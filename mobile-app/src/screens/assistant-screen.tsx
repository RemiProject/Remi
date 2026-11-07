import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { AppText, Button, Card, Chip, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@/services/auth';
import { resolveActiveHousehold } from '@/services/active-household-service';
import { inventoryExpiryDay } from '@/domain/backend-inventory-read-model';
import { localDateKey } from '@/domain/inventory';
import { intakeRequest } from '@/services/intake-api';
import { pantryAnswer, type AssistantRecipe, type AssistantStock } from '@/services/pantry-assistant';
import { IntakeShell, intakeError } from './intake-shell';
export default function AssistantScreen() {
  const { user } = useAuth(); const { language } = useLanguage();
  return <IntakeShell title={language === 'ar' ? 'مساعد المطبخ' : 'Kitchen helper'}><AssistantBody key={user?.id} /></IntakeShell>;
}
function AssistantBody() {
  const { language } = useLanguage(); const ar = language === 'ar';
  const [today, setToday] = useState(localDateKey);
  const [stock, setStock] = useState<AssistantStock[]>([]);
  const [recipes, setRecipes] = useState<AssistantRecipe[]>([]);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const household = await resolveActiveHousehold(getAuth(), AsyncStorage);
      const foods: AssistantStock[] = [];
      let after: string | null = null;
      do {
        const page: { inventory: { nodes: AssistantStock[]; hasNextPage: boolean; endCursor: string | null } } = await intakeRequest('query HelperStock($after: String) { inventory(first: 50, after: $after) { nodes { foodId foodName quantity unit estimatedExpiryAt storageLocation } hasNextPage endCursor } }', { after });
        foods.push(...page.inventory.nodes.map(food => ({ ...food, estimatedExpiryAt: inventoryExpiryDay(food.estimatedExpiryAt, household.timezone) })));
        const next = page.inventory.hasNextPage ? page.inventory.endCursor : null;
        if (page.inventory.hasNextPage && (!next || next === after)) throw new Error('Could not read the next pantry page.');
        after = next;
      } while (after);
      const list = await intakeRequest<{ recipeSuggestions: { nodes: { recipe: { id: string } }[] } }>('query HelperRecipes { recipeSuggestions(first: 12) { nodes { recipe { id } } } }');
      const details = await Promise.all(list.recipeSuggestions.nodes.map(async ({ recipe }) => (await intakeRequest<{ recipe: AssistantRecipe }>('query HelperRecipe($id: ID!) { recipe(id: $id) { id name ingredients { foodId foodName optional } } }', { id: recipe.id })).recipe));
      if (active) { setStock(foods); setRecipes(details); setToday(inventoryExpiryDay(new Date().toISOString(), household.timezone) ?? localDateKey()); }
    };
    load().catch(failure => { if (active) setError(intakeError(failure)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [generation]);
  const refresh = () => { setBusy(true); setError(''); setGeneration(value => value + 1); };
  const result = asked ? pantryAnswer(asked, stock, recipes, language, today) : null;
  const suggestions = ar ? ['ماذا أطبخ؟', 'ما الذي أستخدمه أولاً؟', 'ماذا أشتري؟', 'ماذا في الثلاجة؟'] : ['What can I cook?', 'What should I use first?', 'What should I buy?', 'What is in my fridge?'];
  return <>
    <AppText muted>{ar ? 'مساعد يعتمد على قواعد واضحة وبيانات مطبخك ووصفات الخادم، وليس نموذج ذكاء اصطناعي توليدي.' : 'A rules-powered helper using your kitchen and server recipes. This is not a generative AI chat service.'}</AppText>
    <View style={uiStyles.wrap}>{suggestions.map(text => <Chip key={text} label={text} selected={asked === text} disabled={busy} onPress={() => { setQuestion(text); setAsked(text); }} />)}</View>
    <FormField label={ar ? 'سؤالك عن المطبخ' : 'Your kitchen question'} value={question} onChangeText={setQuestion} editable={!busy} onSubmitEditing={() => setAsked(question.trim())} />
    <Button label={busy ? (ar ? 'جارٍ تحميل المطبخ…' : 'Loading your kitchen…') : (ar ? 'اسأل المساعد' : 'Ask helper')} disabled={busy || !question.trim() || !!error} onPress={() => setAsked(question.trim())} />
    {error !== '' && <Card><AppText accessibilityRole="alert">{error}</AppText><Button label={ar ? 'إعادة المحاولة' : 'Retry'} onPress={refresh} /></Card>}
    {result && !error && <Card><AppText accessibilityLiveRegion="polite">{result.text}</AppText>{result.recipes.map(({ recipe, matches, total }) => <View key={recipe.id} style={{ gap: 8 }}><AppText variant="heading">{recipe.name}</AppText><AppText muted>{matches} / {total} {ar ? 'مكونات مطلوبة موجودة بالاسم' : 'required ingredients present by name'}</AppText><Button label={ar ? 'عرض الوصفة' : 'View recipe'} variant="secondary" onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: recipe.id } })} /></View>)}</Card>}
    <Button label={ar ? 'تحديث بيانات المطبخ' : 'Refresh kitchen data'} disabled={busy} variant="text" onPress={refresh} />
    <Button label={ar ? 'إرشادات سلامة الطعام من USDA' : 'USDA food-safety guidance'} variant="text" onPress={() => { void Linking.openURL('https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts').catch(failure => setError(intakeError(failure))); }} />
  </>;
}
