import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { DomainError } from '@/shared/domain-error.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { PredictionTypeEnum, PredictionConnectionType, FoodDepletionPredictionType } from './prediction.types.js';
import { PredictionQueryService } from '@/modules/predictions/application/prediction.query-service.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class PredictionResolver {
  constructor(private readonly queries: PredictionQueryService) {}

  @Query(() => PredictionConnectionType)
  predictions(
    @Ctx() ctx: RequestContext,
    @Args('type', { type: () => PredictionTypeEnum }) type: PredictionTypeEnum,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) {
    if (type !== PredictionTypeEnum.FOOD_DEPLETION) throw new DomainError('UNSUPPORTED_PREDICTION_TYPE', 'This prediction type is not available yet.', 422);
    return this.queries.listFoodDepletion(ctx.householdId!, first, after);
  }

  @Query(() => [FoodDepletionPredictionType])
  stockForecast(@Ctx() ctx: RequestContext, @Args('foodId', { type: () => ID }) foodId: string) {
    return this.queries.stockForecast(ctx.householdId!, foodId);
  }
}
