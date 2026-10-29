import { demoRecipes } from './kitchen-demo';
import { homeMessages, type HomeMessageKey, type HomeLanguage } from '../i18n/home';

// Illustrative stock imagery. These are not photos of the user's inventory.
export const recipePhotos: Record<string, string> = {
  bowl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=720&q=80',
  breakfast: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=720&q=80',
};
export const kitchenPhoto = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=720&q=80';
export const recipeTitle = (id: string, language: HomeLanguage) => homeMessages[language][id as 'bowl' | 'breakfast'];
export const recipeDescription = (id: string, language: HomeLanguage) => homeMessages[language][`${id}Description` as 'bowlDescription' | 'breakfastDescription'];
export function searchHome<T extends { name: string }>(items: readonly T[], query: string, language: HomeLanguage, scope: 'all' | 'foods' | 'recipes') {
  const term = query.trim().toLocaleLowerCase(language);
  return {
    foods: scope === 'recipes' ? [] : items.filter((item) => item.name.toLocaleLowerCase(language).includes(term)),
    recipes: scope === 'foods' ? [] : demoRecipes.filter((recipe) => [recipeTitle(recipe.id, language), recipe.title,
      ...recipe.ingredients.map((id) => homeMessages[language][id as HomeMessageKey])].join(' ').toLocaleLowerCase(language).includes(term)),
  };
}
