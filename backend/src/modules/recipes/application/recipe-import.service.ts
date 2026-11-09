import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { ReceiptService } from '@/modules/receipts/application/receipt.service.js';
import { parseIngredientLine, recipeFromHtml } from '@/modules/recipes/domain/recipe-page.js';
import { fetchPublicPage } from '@/modules/recipes/infrastructure/safe-fetch.js';
import type { RecipeImportPreviewType, SaveImportedRecipeInput } from '@/modules/recipes/presentation/recipe-import.types.js';
import { RecipeService } from './recipe.service.js';

/** Saving a recipe from a link: read its schema.org data, match ingredients to the catalogue, save under My recipes. */
@Injectable()
export class RecipeImportService {
  constructor(private readonly transactions: TransactionRunner, private readonly matcher: ReceiptService, private readonly recipes: RecipeService) {}

  async preview(householdId: string, userId: string, url: string): Promise<RecipeImportPreviewType> {
    const page = await fetchPublicPage(url);
    const recipe = recipeFromHtml(page.html);
    if (!recipe) throw new DomainError('RECIPE_NOT_FOUND_ON_PAGE', 'No recipe was found on that page. Remi reads pages that publish recipe details for search engines, as most recipe sites do.', 422);
    const lines = recipe.ingredients.map(parseIngredientLine);
    const matches = await this.matcher.match(householdId, userId, lines.map(line => line.name || line.text));
    const saved = await this.transactions.run(tx => tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Recipe" WHERE "householdId" = ${householdId}::uuid AND "sourceUrl" = ${page.url} AND "archivedAt" IS NULL LIMIT 1`, { householdId, readOnly: true });
    return {
      sourceUrl: page.url, sourceName: recipe.siteName ?? new URL(page.url).hostname.replace(/^www\./, ''),
      name: recipe.name, description: recipe.description, servings: recipe.servings,
      prepTimeMin: recipe.prepTimeMin, cookTimeMin: recipe.cookTimeMin ?? (recipe.totalTimeMin !== null && recipe.prepTimeMin !== null ? Math.max(0, recipe.totalTimeMin - recipe.prepTimeMin) : recipe.totalTimeMin),
      imageUrl: recipe.imageUrl, author: recipe.author, steps: recipe.steps, savedRecipeId: saved[0]?.id ?? null,
      ingredients: lines.map((line, index) => ({
        text: line.text, quantity: line.quantity === null ? null : String(line.quantity), unit: line.unit, name: line.name, optional: line.optional,
        confidence: matches[index].confidence, food: matches[index].food, alternatives: matches[index].alternatives,
      })),
    };
  }

  /** Saves the reviewed recipe as a household recipe. Lines with a food and an amount also count for nutrition and the kitchen. */
  async save(householdId: string, input: SaveImportedRecipeInput) {
    const recipeId = newId();
    await this.transactions.run(async tx => {
      await tx.$executeRaw`INSERT INTO "Recipe" ("id", "householdId", "name", "description", "servings", "prepTimeMin", "cookTimeMin", "difficulty", "sourceUrl", "sourceName", "imageUrl")
        VALUES (${recipeId}::uuid, ${householdId}::uuid, ${input.name.trim()}, ${input.description?.trim() || null}, ${input.servings}, ${input.prepTimeMin ?? null}, ${input.cookTimeMin ?? null}, 'MEDIUM'::"RecipeDifficulty", ${input.sourceUrl}, ${input.sourceName?.trim() || null}, ${input.imageUrl ?? null})`;
      const foodIds = [...new Set(input.ingredients.map(i => i.foodId).filter((id): id is string => !!id))];
      if (foodIds.length) {
        const found = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Food" WHERE "id" = ANY(${foodIds}::uuid[]) AND "archivedAt" IS NULL`;
        if (found.length !== foodIds.length) throw new DomainError('FOOD_NOT_FOUND', 'One or more recipe foods do not exist.', 404);
      }
      // A food appears once per recipe: the same food in the same unit is added up; otherwise the later line stays text.
      const byFood = new Map<string, { id: string; unit: Unit; quantity: number }>();
      for (const [index, line] of input.ingredients.entries()) {
        let linked: string | null = null;
        if (line.foodId && line.quantity && line.unit) {
          const existing = byFood.get(line.foodId);
          if (!existing) {
            linked = newId();
            await tx.$executeRaw`INSERT INTO "RecipeIngredient" ("id", "recipeId", "foodId", "quantity", "unit", "optional") VALUES (${linked}::uuid, ${recipeId}::uuid, ${line.foodId}::uuid, ${line.quantity}::numeric, ${line.unit}::"Unit", ${line.optional ?? false})`;
            byFood.set(line.foodId, { id: linked, unit: line.unit, quantity: Number(line.quantity) });
          } else if (existing.unit === line.unit) {
            existing.quantity += Number(line.quantity); linked = existing.id;
            await tx.$executeRaw`UPDATE "RecipeIngredient" SET "quantity" = ${existing.quantity.toFixed(3)}::numeric WHERE "id" = ${existing.id}::uuid`;
          }
        }
        await tx.$executeRaw`INSERT INTO "RecipeIngredientLine" ("id", "recipeId", "position", "text", "recipeIngredientId") VALUES (${newId()}::uuid, ${recipeId}::uuid, ${index + 1}, ${line.text.trim().slice(0, 500) || '—'}, ${linked}::uuid)`;
      }
      for (const [index, step] of input.steps.map(s => s.trim()).filter(Boolean).entries()) {
        await tx.$executeRaw`INSERT INTO "RecipeStep" ("id", "recipeId", "stepNumber", "instruction") VALUES (${newId()}::uuid, ${recipeId}::uuid, ${index + 1}, ${step})`;
      }
    }, { householdId });
    return this.recipes.get(householdId, recipeId);
  }

  /** Removes one of the household's own recipes from My recipes. Catalogue recipes cannot be removed. */
  async archive(householdId: string, recipeId: string): Promise<boolean> {
    const changed = await this.transactions.run(tx => tx.$executeRaw`UPDATE "Recipe" SET "archivedAt" = now(), "updatedAt" = now()
      WHERE "id" = ${recipeId}::uuid AND "householdId" = ${householdId}::uuid AND "archivedAt" IS NULL`, { householdId });
    if (!changed) throw new DomainError('RECIPE_NOT_FOUND', 'That recipe is not in My recipes.', 404);
    return true;
  }
}
