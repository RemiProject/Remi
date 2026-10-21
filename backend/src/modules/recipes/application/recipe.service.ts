import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { Unit } from '@/shared/food-unit.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';

export type IngredientInput = { foodId: string; quantity: string; unit: Unit; optional?: boolean };
export type StepInput = { instruction: string; durationMin?: number };
export type CreateRecipeInput = {
  name: string; description?: string; cuisineId?: string; servings: number;
  prepTimeMin?: number; cookTimeMin?: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  ingredients: IngredientInput[]; steps: StepInput[];
};

@Injectable()
export class RecipeService {
  constructor(private readonly transactions: TransactionRunner) {}

  async create(householdId: string, input: CreateRecipeInput) {
    if (input.ingredients.length > 100 || input.steps.length > 100) throw new DomainError('RECIPE_TOO_COMPLEX', 'A recipe can contain at most 100 ingredients and 100 steps.');
    const recipeId = newId();
    await this.transactions.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO "Recipe" ("id", "householdId", "cuisineId", "name", "description", "servings", "prepTimeMin", "cookTimeMin", "difficulty") VALUES (${recipeId}::uuid, ${householdId}::uuid, ${input.cuisineId ?? null}::uuid, ${input.name.trim()}, ${input.description?.trim() ?? null}, ${input.servings}, ${input.prepTimeMin ?? null}, ${input.cookTimeMin ?? null}, ${input.difficulty}::"RecipeDifficulty")`;
      const foodIds = input.ingredients.map((item) => item.foodId);
      if (new Set(foodIds).size !== foodIds.length) throw new DomainError('DUPLICATE_RECIPE_FOOD', 'A food may appear only once in a recipe.');
      if (foodIds.length) {
        const foods = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Food" WHERE "id" = ANY(${foodIds}::uuid[]) AND "archivedAt" IS NULL`;
        if (foods.length !== foodIds.length) throw new DomainError('FOOD_NOT_FOUND', 'One or more recipe foods do not exist.', 404);
      }
      for (const ingredient of input.ingredients) {
        await tx.$executeRaw`INSERT INTO "RecipeIngredient" ("id", "recipeId", "foodId", "quantity", "unit", "optional") VALUES (${newId()}::uuid, ${recipeId}::uuid, ${ingredient.foodId}::uuid, ${ingredient.quantity}::numeric, ${ingredient.unit}::"Unit", ${ingredient.optional ?? false})`;
      }
      for (const [index, step] of input.steps.entries()) {
        await tx.$executeRaw`INSERT INTO "RecipeStep" ("id", "recipeId", "stepNumber", "instruction", "durationMin") VALUES (${newId()}::uuid, ${recipeId}::uuid, ${index + 1}, ${step.instruction.trim()}, ${step.durationMin ?? null})`;
      }
    }, { householdId });
    return this.get(householdId, recipeId);
  }

  async list(householdId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const afterId = decodeCursor(after);
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT r."id", r."householdId", r."cuisineId", c."name" AS "cuisineName", r."name", r."description", r."servings", r."prepTimeMin", r."cookTimeMin", r."difficulty"::text AS "difficulty", r."createdAt"
        FROM "Recipe" r LEFT JOIN "Cuisine" c ON c."id" = r."cuisineId"
        WHERE r."archivedAt" IS NULL AND (r."householdId" IS NULL OR r."householdId" = ${householdId}::uuid)
          AND (${afterId}::uuid IS NULL OR (r."createdAt", r."id") > (SELECT c."createdAt", c."id" FROM "Recipe" c WHERE c."id" = ${afterId}::uuid AND c."archivedAt" IS NULL AND (c."householdId" IS NULL OR c."householdId" = ${householdId}::uuid)))
        ORDER BY r."createdAt", r."id" LIMIT ${first + 1}`;
      const hasNextPage = rows.length > first;
      const nodes = rows.slice(0, first);
      const last = nodes[nodes.length - 1];
      return { nodes, hasNextPage, endCursor: last ? Buffer.from(String(last.id)).toString('base64url') : null };
    }, { householdId });
  }

  async get(householdId: string, id: string) {
    return this.transactions.run(async (tx) => this.getInTransaction(tx, householdId, id), { householdId });
  }

  private async getInTransaction(tx: Tx, householdId: string, id: string) {
    const recipes = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT r."id", r."householdId", r."cuisineId", c."name" AS "cuisineName", r."name", r."description", r."servings", r."prepTimeMin", r."cookTimeMin", r."difficulty"::text AS "difficulty", r."createdAt"
      FROM "Recipe" r LEFT JOIN "Cuisine" c ON c."id" = r."cuisineId"
      WHERE r."id" = ${id}::uuid AND r."archivedAt" IS NULL AND (r."householdId" IS NULL OR r."householdId" = ${householdId}::uuid)`;
    if (!recipes.length) throw new DomainError('RECIPE_NOT_FOUND', 'The recipe does not exist in this household.', 404);
    const ingredients = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ri."id", ri."foodId", f."name" AS "foodName", ri."quantity"::text AS "quantity", ri."unit"::text AS "unit", ri."optional"
      FROM "RecipeIngredient" ri JOIN "Food" f ON f."id" = ri."foodId" WHERE ri."recipeId" = ${id}::uuid ORDER BY f."name"`;
    const steps = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "stepNumber", "instruction", "durationMin" FROM "RecipeStep" WHERE "recipeId" = ${id}::uuid ORDER BY "stepNumber"`;
    return { ...recipes[0], ingredients, steps };
  }
}

function decodeCursor(after?: string): string | null {
  if (!after) return null;
  const id = Buffer.from(after, 'base64url').toString();
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && Buffer.from(id).toString('base64url') === after;
  if (!valid) throw new DomainError('INVALID_CURSOR', 'The recipe cursor is invalid.');
  return id;
}
