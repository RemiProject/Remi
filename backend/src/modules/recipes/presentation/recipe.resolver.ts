import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RecipeService } from '@/modules/recipes/application/recipe.service.js';
import { CreateRecipeInputType, RecipeConnectionType, RecipeType } from '@/modules/recipes/presentation/recipe.types.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class RecipeResolver {
  constructor(private readonly service: RecipeService) {}

  @Query(() => RecipeConnectionType)
  recipes(
    @Ctx() ctx: RequestContext,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) {
    return this.service.list(ctx.householdId!, first, after);
  }

  @Query(() => RecipeType)
  recipe(@Ctx() ctx: RequestContext, @Args('id', { type: () => ID }) id: string) {
    return this.service.get(ctx.householdId!, id);
  }

  @Mutation(() => RecipeType)
  createRecipe(@Ctx() ctx: RequestContext, @Args('input') input: CreateRecipeInputType) {
    return this.service.create(ctx.householdId!, input);
  }
}
