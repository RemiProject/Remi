import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { RecipeImportService } from '@/modules/recipes/application/recipe-import.service.js';
import { RecipeType } from './recipe.types.js';
import { RecipeImportPreviewType, SaveImportedRecipeInput } from './recipe-import.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class RecipeImportResolver {
  constructor(private readonly imports: RecipeImportService) {}

  @Query(() => RecipeImportPreviewType)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  previewRecipeImport(@Ctx() ctx: RequestContext, @Args('url') url: string) {
    return this.imports.preview(ctx.householdId!, ctx.userId, url.slice(0, 2000));
  }

  @Mutation(() => RecipeType)
  saveImportedRecipe(@Ctx() ctx: RequestContext, @Args('input') input: SaveImportedRecipeInput) {
    return this.imports.save(ctx.householdId!, input);
  }

  @Mutation(() => Boolean)
  archiveRecipe(@Ctx() ctx: RequestContext, @Args('id', { type: () => ID }) id: string) {
    return this.imports.archive(ctx.householdId!, id);
  }
}
