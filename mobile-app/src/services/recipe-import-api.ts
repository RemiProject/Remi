import { kitchenRequest, recipeDetailFields, type Recipe } from './kitchen-api';
import type { RecipeImportPreview, saveInput } from '@/domain/recipe-import';

const option = 'foodId name arabicName categoryCode categoryName defaultUnit gramsPerPiece storageLocation score';
const previewQuery = `query PreviewRecipeImport($url: String!) { previewRecipeImport(url: $url) { sourceUrl sourceName name description servings prepTimeMin cookTimeMin imageUrl author steps savedRecipeId
  ingredients { text quantity unit name optional confidence food { ${option} } alternatives { ${option} } } } }`;

export async function previewRecipeImport(url: string): Promise<RecipeImportPreview> {
  return (await kitchenRequest<{ previewRecipeImport: RecipeImportPreview }>(previewQuery, { url })).previewRecipeImport;
}
export async function saveImportedRecipe(input: ReturnType<typeof saveInput>): Promise<Recipe> {
  return (await kitchenRequest<{ saveImportedRecipe: Recipe }>(`mutation SaveImportedRecipe($input: SaveImportedRecipeInput!) { saveImportedRecipe(input: $input) { ${recipeDetailFields} } }`, { input })).saveImportedRecipe;
}
export async function archiveRecipe(id: string): Promise<void> {
  await kitchenRequest('mutation ArchiveRecipe($id: ID!) { archiveRecipe(id: $id) }', { id });
}
