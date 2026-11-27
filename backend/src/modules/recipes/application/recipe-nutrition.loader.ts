import type { Tx } from '@/platform/db/tx-context.js';
import { recipeNutrition, type NutritionIngredient, type RecipeNutrition } from '@/modules/recipes/domain/recipe-nutrition.js';

type Row = {
  recipeId: string; servings: number; quantity: string; unit: string; optional: boolean;
  gramsPerPiece: string | null; densityGPerMl: string | null;
  calories: string | null; proteinG: string | null; carbsG: string | null; fatG: string | null;
  fiberG: string | null; sugarG: string | null; sodiumMg: string | null;
};

/** One query for any number of recipes; the caller's transaction scopes which recipes are visible. */
export async function loadRecipeNutrition(tx: Tx, recipeIds: string[]): Promise<Map<string, RecipeNutrition | null>> {
  const result = new Map<string, RecipeNutrition | null>();
  if (!recipeIds.length) return result;
  const rows = await tx.$queryRaw<Row[]>`
    SELECT ri."recipeId", r."servings", ri."quantity"::text AS "quantity", ri."unit"::text AS "unit", ri."optional",
      f."gramsPerPiece"::text AS "gramsPerPiece", f."densityGPerMl"::text AS "densityGPerMl",
      n."caloriesPer100g"::text AS "calories", n."proteinG"::text AS "proteinG", n."carbsG"::text AS "carbsG", n."fatG"::text AS "fatG",
      n."fiberG"::text AS "fiberG", n."sugarG"::text AS "sugarG", n."sodiumMg"::text AS "sodiumMg"
    FROM "RecipeIngredient" ri
    JOIN "Recipe" r ON r."id" = ri."recipeId"
    JOIN "Food" f ON f."id" = ri."foodId"
    LEFT JOIN "NutritionProfile" n ON n."foodId" = f."id"
    WHERE ri."recipeId" = ANY(${recipeIds}::uuid[])`;
  const grouped = new Map<string, { servings: number; items: NutritionIngredient[] }>();
  for (const row of rows) {
    const entry = grouped.get(row.recipeId) ?? { servings: row.servings, items: [] };
    entry.items.push({
      quantity: row.quantity, unit: row.unit, optional: row.optional,
      food: { gramsPerPiece: row.gramsPerPiece, densityGPerMl: row.densityGPerMl },
      per100g: row.calories === null ? null : {
        calories: row.calories, proteinG: row.proteinG!, carbsG: row.carbsG!, fatG: row.fatG!,
        fiberG: row.fiberG, sugarG: row.sugarG, sodiumMg: row.sodiumMg!,
      },
    });
    grouped.set(row.recipeId, entry);
  }
  for (const id of recipeIds) {
    const entry = grouped.get(id);
    result.set(id, entry ? recipeNutrition(entry.servings, entry.items) : null);
  }
  return result;
}

/** Adds `nutrition` to each recipe row. */
export async function withNutrition<T extends Record<string, unknown>>(tx: Tx, rows: T[]): Promise<Array<T & { nutrition: RecipeNutrition | null }>> {
  const nutrition = await loadRecipeNutrition(tx, rows.map((row) => String(row['id'])));
  return rows.map((row) => ({ ...row, nutrition: nutrition.get(String(row['id'])) ?? null }));
}
