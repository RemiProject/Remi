export interface FoodAliasRow { id: string; alias: string; isPrimary: boolean; language: { code: string } }
export interface NutritionRow {
  caloriesPer100g: string; proteinG: string; carbsG: string; fatG: string;
  fiberG: string; sugarG: string; sodiumMg: string;
}
export interface FoodRow {
  id: string; name: string; defaultUnit: string; gramsPerPiece: string | null; densityGPerMl: string | null;
  category: { id: string; code: string; name: string };
  aliases: FoodAliasRow[]; nutrition: NutritionRow | null;
}
export interface FoodConnection { nodes: FoodRow[]; hasNextPage: boolean; endCursor: string | null }
