import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { DomainError } from '@/shared/domain-error.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { RecommendationService } from '@/modules/recommendations/application/recommendation.service.js';
import { RecommendationConnectionType, RecommendationTypeEnum } from './recommendation.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class RecommendationResolver {
  constructor(private readonly service: RecommendationService) {}

  @Query(() => RecommendationConnectionType)
  recommendations(
    @Ctx() ctx: RequestContext,
    @Args('type', { type: () => RecommendationTypeEnum }) type: RecommendationTypeEnum,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) {
    if (type !== RecommendationTypeEnum.SUPPLY_NEED) throw new DomainError('UNSUPPORTED_RECOMMENDATION_TYPE', 'This recommendation type is not available yet.', 422);
    return this.service.visible(ctx.householdId!, ctx.userId, first, after);
  }

  @Mutation(() => Boolean)
  acceptRecommendation(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.service.respond(ctx.householdId!, ctx.userId, id, 'ACCEPTED');
  }

  @Mutation(() => Boolean)
  dismissRecommendation(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.service.respond(ctx.householdId!, ctx.userId, id, 'DISMISSED');
  }

  @Mutation(() => Boolean)
  regenerateRecommendations(@Ctx() ctx: RequestContext, @Args('type', { type: () => RecommendationTypeEnum }) type: RecommendationTypeEnum) {
    if (type !== RecommendationTypeEnum.SUPPLY_NEED) throw new DomainError('UNSUPPORTED_RECOMMENDATION_TYPE', 'This recommendation type is not available yet.', 422);
    return this.service.regenerate(ctx.householdId!, ctx.userId);
  }
}
