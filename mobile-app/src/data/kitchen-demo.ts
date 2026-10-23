export const storages = ['Refrigerator', 'Freezer', 'Pantry'] as const;
export const categories = ['Produce', 'Dairy', 'Protein', 'Grains'] as const;
export type Storage = (typeof storages)[number];
export type Category = (typeof categories)[number];
export interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  storage: Storage;
  category: Category;
  useWithinDays?: number;
  note: string;
}

// All values are illustrative fixtures, not account data or food-safety assessments.
export const demoFoods: readonly FoodItem[] = [
  { id: 'spinach', name: 'Baby spinach', quantity: 150, unit: 'g', storage: 'Refrigerator', category: 'Produce', useWithinDays: 1, note: 'Sample inventory item. Keep sealed in the refrigerator.' },
  { id: 'yogurt', name: 'Greek yogurt', quantity: 2, unit: 'cups', storage: 'Refrigerator', category: 'Dairy', useWithinDays: 2, note: 'Sample inventory item. Check the product label before use.' },
  { id: 'tomatoes', name: 'Cherry tomatoes', quantity: 250, unit: 'g', storage: 'Refrigerator', category: 'Produce', useWithinDays: 3, note: 'Sample inventory item for browsing and recipe inspiration.' },
  { id: 'chicken', name: 'Chicken breast', quantity: 500, unit: 'g', storage: 'Freezer', category: 'Protein', note: 'Sample frozen item. Follow product instructions when thawing.' },
  { id: 'berries', name: 'Mixed berries', quantity: 300, unit: 'g', storage: 'Freezer', category: 'Produce', note: 'Sample frozen item for smoothies and breakfast ideas.' },
  { id: 'rice', name: 'Brown rice', quantity: 1, unit: 'kg', storage: 'Pantry', category: 'Grains', note: 'Sample pantry staple. Store according to the product label.' },
  { id: 'oats', name: 'Rolled oats', quantity: 500, unit: 'g', storage: 'Pantry', category: 'Grains', note: 'Sample pantry staple for breakfast inspiration.' },
];
export const demoProfile = { firstName: 'Maya' };
export const demoRecipes = [
  { id: 'bowl', title: 'Spinach & rice bowl', minutes: 20, description: 'A simple idea using spinach and brown rice.', ingredients: ['spinach', 'rice'] },
  { id: 'breakfast', title: 'Berry yogurt breakfast', minutes: 5, description: 'A quick idea using yogurt, berries, and oats.', ingredients: ['yogurt', 'berries', 'oats'] },
] as const;
export const demoNutrition = { label: 'Example lunch', calories: 420, proteinGrams: 22, fiberGrams: 8 };

export function filterFoods(items: readonly FoodItem[], query: string, category: Category | 'All', storage: Storage | 'All') {
  const normalized = query.trim().toLocaleLowerCase();
  return items.filter((item) => (!normalized || item.name.toLocaleLowerCase().includes(normalized)) &&
    (category === 'All' || item.category === category) && (storage === 'All' || item.storage === storage));
}
