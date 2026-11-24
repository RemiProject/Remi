import type { ReceiptFoodOption } from './receipt-review';

export interface ImportedIngredient {
  text: string; quantity: string | null; unit: string | null; name: string; optional: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'NONE'; food: ReceiptFoodOption | null; alternatives: ReceiptFoodOption[];
}
export interface RecipeImportPreview {
  sourceUrl: string; sourceName: string | null; name: string; description: string | null; servings: number | null;
  prepTimeMin: number | null; cookTimeMin: number | null; imageUrl: string | null; author: string | null;
  ingredients: ImportedIngredient[]; steps: string[]; savedRecipeId: string | null;
}

/** Text direction from the text itself: a saved recipe can be English in the Arabic app, or the other way round. */
export const textDir = (text: string): 'rtl' | 'ltr' => /[\u0590-\u08FF]/.test(text) ? 'rtl' : 'ltr';

/** The first web link in shared text ("Look at this! https://site/recipe?x=1."), without trailing punctuation. */
export function firstUrl(text: string | null | undefined): string | null {
  const match = /https?:\/\/[^\s<>"'“”]+/i.exec(text ?? '');
  return match ? match[0].replace(/[).,;:!?»”’]+$/, '') : null;
}

/** Which ingredient lines are linked to a catalogue food: confident matches with an amount, unless the person unlinked them. */
export function linkedByDefault(ingredient: ImportedIngredient): boolean {
  return ingredient.confidence === 'HIGH' && !!ingredient.food && ingredient.quantity !== null && ingredient.unit !== null;
}

/** The saveImportedRecipe input from the preview and the person's edits. Every line is kept as text; linked ones carry a food. */
export function saveInput(preview: RecipeImportPreview, edits: { name: string; servings: number; linked: ReadonlySet<number> }) {
  return {
    sourceUrl: preview.sourceUrl, sourceName: preview.sourceName ?? undefined, name: edits.name.trim() || preview.name,
    description: preview.description ?? undefined, servings: edits.servings,
    prepTimeMin: preview.prepTimeMin ?? undefined, cookTimeMin: preview.cookTimeMin ?? undefined, imageUrl: preview.imageUrl ?? undefined,
    steps: preview.steps,
    ingredients: preview.ingredients.map((ingredient, index) => ({
      text: ingredient.text, optional: ingredient.optional,
      ...(edits.linked.has(index) && ingredient.food && ingredient.quantity && ingredient.unit ? { foodId: ingredient.food.foodId, quantity: ingredient.quantity, unit: ingredient.unit } : {}),
    })),
  };
}
