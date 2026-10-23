import { searchHome } from '../data/home-content';
import type { InventoryItem } from '../domain/inventory';
import type { HomeLanguage } from '../i18n/home';

export function discoverRecipes(query: string, language: HomeLanguage, maxMinutes: number | null) {
  return searchHome([], query, language, 'recipes').recipes.filter((recipe) => maxMinutes === null || recipe.minutes <= maxMinutes);
}
const aliases: Record<string, readonly string[]> = {
  spinach: ['spinach', 'baby spinach', 'سبانخ'], rice: ['rice', 'brown rice', 'أرز', 'ارز', 'أرز بني', 'ارز بني'],
  yogurt: ['yogurt', 'greek yogurt', 'زبادي', 'زبادي يوناني'], berries: ['berries', 'mixed berries', 'توت', 'توت مشكل'],
  oats: ['oats', 'rolled oats', 'شوفان'],
};
const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export function ingredientMatches(ingredient: string, items: readonly InventoryItem[]) {
  const names = aliases[ingredient] ?? [];
  return items.filter((item) => names.includes(normalize(item.name)));
}
