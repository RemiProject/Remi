import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';

export interface CreateMealPlanInput { name: string; startDate: string; endDate: string }
export interface PlanMealInput { mealPlanId: string; recipeId: string; mealDate: string; mealType: string; servings: string }

@Injectable()
export class MealPlanService {
  constructor(private readonly transactions: TransactionRunner) {}

  async createPlan(householdId: string, input: CreateMealPlanInput) {
    validateDateRange(input.startDate, input.endDate);
    const id = newId();
    await this.transactions.run(async (tx) => {
      await tx.$executeRaw`INSERT INTO "MealPlan" ("id", "householdId", "name", "startDate", "endDate") VALUES (${id}::uuid, ${householdId}::uuid, ${input.name.trim()}, ${input.startDate}::date, ${input.endDate}::date)`;
    }, { householdId });
    return { id, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate, meals: [] };
  }

  async planMeal(householdId: string, input: PlanMealInput) {
    const id = newId();
    await this.transactions.run(async (tx) => {
      const plan = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "MealPlan" WHERE "id" = ${input.mealPlanId}::uuid AND "householdId" = ${householdId}::uuid`;
      if (!plan.length) throw new DomainError('MEAL_PLAN_NOT_FOUND', 'The selected meal plan does not exist.', 404);
      const recipe = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Recipe" WHERE "id" = ${input.recipeId}::uuid AND "archivedAt" IS NULL AND ("householdId" IS NULL OR "householdId" = ${householdId}::uuid)`;
      if (!recipe.length) throw new DomainError('RECIPE_NOT_FOUND', 'The selected recipe does not exist in this household.', 404);
      await tx.$executeRaw`INSERT INTO "PlannedMeal" ("id", "mealPlanId", "householdId", "recipeId", "mealDate", "mealType", "servings") VALUES (${id}::uuid, ${input.mealPlanId}::uuid, ${householdId}::uuid, ${input.recipeId}::uuid, ${input.mealDate}::date, ${input.mealType}::"MealType", ${input.servings}::numeric)`;
    }, { householdId });
    return this.getPlannedMeal(householdId, id);
  }

  async listPlans(householdId: string, from: string, to: string) {
    validateDateRange(from, to);
    return this.transactions.run(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ id: string; name: string; startDate: string; endDate: string }>>`
        SELECT "id", "name", "startDate"::text AS "startDate", "endDate"::text AS "endDate" FROM "MealPlan"
        WHERE "householdId" = ${householdId}::uuid AND "endDate" >= ${from}::date AND "startDate" <= ${to}::date ORDER BY "startDate", "id"`;
      if (!plans.length) return [];
      const planned = await tx.$queryRaw<Array<{ id: string; mealPlanId: string; recipeId: string; recipeName: string; mealDate: string; mealType: string; servings: string }>>`
        SELECT p."id", p."mealPlanId", p."recipeId", r."name" AS "recipeName", p."mealDate"::text AS "mealDate", p."mealType"::text AS "mealType", p."servings"::text AS "servings"
        FROM "PlannedMeal" p JOIN "Recipe" r ON r."id" = p."recipeId"
        WHERE p."householdId" = ${householdId}::uuid AND p."mealPlanId" = ANY(${plans.map((plan) => plan.id)}::uuid[])
        ORDER BY p."mealDate", p."mealType", p."id"`;
      return plans.map((plan) => ({ ...plan, meals: planned.filter((meal) => meal.mealPlanId === plan.id) }));
    }, { householdId });
  }

  async dailyNutrition(userId: string, from: string, to: string) {
    validateDateRange(from, to, 366);
    return this.transactions.run(async (tx) => tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "date"::text AS "date", "calories"::text AS "calories", "proteinG"::text AS "proteinG", "carbsG"::text AS "carbsG", "fatG"::text AS "fatG",
             "fiberG"::text AS "fiberG", "sugarG"::text AS "sugarG", "sodiumMg"::text AS "sodiumMg", "mealCount", "isFinal", "computedAt"
      FROM "UserDailyNutrition" WHERE "userId" = ${userId}::uuid AND "date" BETWEEN ${from}::date AND ${to}::date ORDER BY "date"`, { userId });
  }

  private async getPlannedMeal(householdId: string, id: string) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; recipeId: string; recipeName: string; mealDate: string; mealType: string; servings: string }>>`
        SELECT p."id", p."recipeId", r."name" AS "recipeName", p."mealDate"::text AS "mealDate", p."mealType"::text AS "mealType", p."servings"::text AS "servings"
        FROM "PlannedMeal" p JOIN "Recipe" r ON r."id" = p."recipeId" WHERE p."id" = ${id}::uuid AND p."householdId" = ${householdId}::uuid`;
      if (!rows.length) throw new DomainError('PLANNED_MEAL_NOT_FOUND', 'The planned meal does not exist.', 404);
      return rows[0];
    }, { householdId });
  }
}

function validateDateRange(from: string, to: string, maxDays = 92): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new DomainError('INVALID_DATE_RANGE', 'Dates must be valid ISO calendar dates and the start must not follow the end.');
  const fromDay = Date.parse(`${from}T00:00:00Z`);
  const toDay = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromDay) || !Number.isFinite(toDay) || new Date(fromDay).toISOString().slice(0, 10) !== from || new Date(toDay).toISOString().slice(0, 10) !== to || (toDay - fromDay) / 86400000 > maxDays) throw new DomainError('INVALID_DATE_RANGE', `Date ranges may not exceed ${maxDays + 1} days.`);
}
