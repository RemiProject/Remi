import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { RecipeSuggestionsService } from '@/modules/recipes/application/recipe-suggestions.service.js';
import { RecipeSuggestionsConnectionType } from '@/modules/recipes/presentation/recipe-suggestions.types.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class RecipeSuggestionsResolver {
  constructor(private readonly suggestions: RecipeSuggestionsService) {}

  @Query(() => RecipeSuggestionsConnectionType)
  recipeSuggestions(
    @Ctx() ctx: RequestContext,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) { return this.suggestions.list(ctx.householdId!, ctx.userId, first, after); }
}
