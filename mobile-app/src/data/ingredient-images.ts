import { ingredientImages } from '@/data/food-images';

const key = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
/** The catalogue photo for a food, by its exact name, Arabic name or catalogue alias. */
export function ingredientImage(name: string): number | undefined {
  return ingredientImages[key(name)];
}
