import type { BackendRecipe, RecipeFood, RecipeSuggestion, RecipeSummary } from '../domain/backend-recipes';
import type { BackendUnit } from '../domain/backend-inventory';
import { toMobileUnit } from '../domain/inventory-enum-adapters';
import { homeUnitLabels } from '../i18n/home';
import { backendKitchenMessages } from '../i18n/backend-kitchen';
import { backendRecipeMessages, recipeCountUnitLabels, recipeText } from '../i18n/backend-recipes';
import { displayInventoryQuantity, inventoryNumberLabel } from './backend-kitchen-view';

type Language = 'en' | 'ar';
export const recipeFoodName = (food: RecipeFood, language: Language) => language === 'ar'
  ? food.arabicName?.trim() || food.foodName : food.foodName.charAt(0).toLocaleUpperCase('en') + food.foodName.slice(1);
export const recipeNumber = (value: number, language: Language) => inventoryNumberLabel(value.toLocaleString(language), language);
export function recipeQuantity(value: string, unit: BackendUnit, language: Language) {
  const mapped = toMobileUnit(unit);
  const labels: Partial<Record<BackendUnit, string>> = backendKitchenMessages[language];
  let label = mapped.supported ? homeUnitLabels[language][mapped.value] : labels[unit] ?? unit;
  if (unit === 'PIECE' || unit === 'CUP') {
    const forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string } = recipeCountUnitLabels[language][unit];
    // Numeric conversion selects grammar only; the displayed decimal stays exact.
    label = forms[new Intl.PluralRules(language).select(Number(value))] ?? forms.other;
  }
  return `${inventoryNumberLabel(displayInventoryQuantity(value), language)} ${label}`;
}
export function recipeMetadata(recipe: RecipeSummary, language: Language) {
  const t = backendRecipeMessages[language];
  const time = recipe.prepTimeMin === null || recipe.cookTimeMin === null ? t.timeUnknown : `${recipeNumber(recipe.prepTimeMin + recipe.cookTimeMin, language)} ${t.minutes}`;
  return `${time} · ${t[recipe.difficulty]} · ${recipeText(t.servings, { count: recipeNumber(recipe.servings, language) })}`;
}
export function recipeCoverage(suggestion: RecipeSuggestion, language: Language) {
  return recipeText(backendRecipeMessages[language].have, { have: recipeNumber(suggestion.haveCount, language), required: recipeNumber(suggestion.requiredCount, language) });
}
export function recipeMissing(suggestion: RecipeSuggestion, language: Language) {
  return recipeFoodList(suggestion.missing, 'missing', language);
}
export function recipeExpired(suggestion: RecipeSuggestion, language: Language) {
  return recipeFoodList(suggestion.expired, 'expired', language);
}
function recipeFoodList(items: RecipeFood[], label: 'missing' | 'expired', language: Language) {
  if (!items.length) return null;
  const foods = items.slice(0, 3).map(f => recipeFoodName(f, language)).join(language === 'ar' ? '، ' : ', ');
  const remaining = items.length - 3;
  return recipeText(backendRecipeMessages[language][label], { foods: `${foods}${remaining > 0 ? ` · ${inventoryNumberLabel(`+${remaining}`, language)}` : ''}` });
}
export function recipeExpiry(suggestion: RecipeSuggestion, today: string, language: Language) {
  const food = [...suggestion.expiringSoon].sort((a, b) => a.expiryDay.localeCompare(b.expiryDay) || a.foodId.localeCompare(b.foodId))[0];
  if (!food || !today) return null;
  const t = backendRecipeMessages[language];
  const days = (Date.parse(`${food.expiryDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  const when = days === 0 ? t.today : days === 1 ? t.tomorrow : recipeText(t.inDays, { days: recipeNumber(days, language) });
  return recipeText(t.uses, { food: recipeFoodName(food, language), when });
}
export function recipeIngredientStatus(ingredient: Pick<BackendRecipe['ingredients'][number], 'foodId' | 'optional'>, suggestion: RecipeSuggestion | undefined, language: Language) {
  if (!suggestion) return null;
  const t = backendRecipeMessages[language], id = ingredient.foodId;
  if (suggestion.expired.some(i => i.foodId === id) || suggestion.optional.some(i => i.foodId === id && i.status === 'EXPIRED')) return t.EXPIRED;
  if (ingredient.optional) return t.optional;
  if (suggestion.assumedStaples.some(i => i.foodId === id)) return t.ASSUMED;
  const short = suggestion.short.find(i => i.foodId === id);
  if (short) return recipeText(t.SHORT, { amount: recipeQuantity(short.missingAmount, short.unit, language) });
  if (suggestion.unknown.some(i => i.foodId === id)) return t.UNKNOWN;
  if (suggestion.missing.some(i => i.foodId === id)) return t.MISSING;
  return t.ENOUGH;
}
