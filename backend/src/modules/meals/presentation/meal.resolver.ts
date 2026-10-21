import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MealLoggingService } from '@/modules/meals/application/meal-logging.service.js';
import { InsufficientStockError } from '@/modules/inventory/application/inventory-ledger.service.js';
import { MealPlanService } from '@/modules/meals/application/meal-plan.service.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { DomainError } from '@/shared/domain-error.js';
import {
  CreateMealPlanInputType, LogFamilyMealInputType, LogMealInputType,
  MealLogResult, MealLogSuccessType, MealPlanTypeObject, PlannedMealType, PlanMealInputType,
  SharesMismatchType, UserDailyNutritionType,
} from './meal.types.js';
import { InsufficientStockType } from '@/modules/inventory/presentation/inventory.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class MealResolver {
  constructor(private readonly meals: MealLoggingService, private readonly plans: MealPlanService) {}

  @Mutation(() => MealLogResult)
  async logMeal(@Ctx() ctx: RequestContext, @Args('input') input: LogMealInputType) {
    try {
      return Object.assign(new MealLogSuccessType(), await this.meals.logMeal(ctx.householdId!, ctx.userId, input));
    } catch (error) {
      if (error instanceof InsufficientStockError) return Object.assign(new InsufficientStockType(), error.details);
      throw error;
    }
  }

  @Mutation(() => MealLogResult)
  async logFamilyMeal(@Ctx() ctx: RequestContext, @Args('input') input: LogFamilyMealInputType) {
    try {
      return Object.assign(new MealLogSuccessType(), await this.meals.logFamilyMeal(ctx.householdId!, ctx.userId, input));
    } catch (error) {
      if (error instanceof InsufficientStockError) return Object.assign(new InsufficientStockType(), error.details);
      if (error instanceof DomainError && error.code === 'SHARES_MISMATCH') {
        return Object.assign(new SharesMismatchType(), error.details);
      }
      throw error;
    }
  }

  @Mutation(() => MealPlanTypeObject)
  createMealPlan(@Ctx() ctx: RequestContext, @Args('input') input: CreateMealPlanInputType) {
    return this.plans.createPlan(ctx.householdId!, input);
  }

  @Mutation(() => PlannedMealType)
  async planMeal(@Ctx() ctx: RequestContext, @Args('input') input: PlanMealInputType) {
    return this.plans.planMeal(ctx.householdId!, input);
  }

  @Query(() => [MealPlanTypeObject])
  mealPlans(
    @Ctx() ctx: RequestContext,
    @Args('from') from: string,
    @Args('to') to: string,
  ) {
    return this.plans.listPlans(ctx.householdId!, from, to);
  }

  @Query(() => [UserDailyNutritionType])
  dailyNutrition(
    @Ctx() ctx: RequestContext,
    @Args('from') from: string,
    @Args('to') to: string,
  ) {
    return this.plans.dailyNutrition(ctx.userId, from, to);
  }
}
