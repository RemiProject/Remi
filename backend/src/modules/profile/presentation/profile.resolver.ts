import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { ProfileService } from '@/modules/profile/application/profile.service.js';
import { AllergyInputType, HealthConditionCatalogType, MyProfileType, RemoveAllergyInputType, SafetyHistoryConnectionType, SetDietaryPreferencesInputType, SetGoalInputType, SetHealthConditionsInputType, UpdateProfileInputType, UserGoalType, UserProfileDataType } from './profile.types.js';

@Resolver()
@UseGuards(GqlAuthGuard)
export class ProfileResolver {
  constructor(private readonly profile: ProfileService) {}

  @Query(() => MyProfileType)
  myProfile(@Ctx() ctx: RequestContext) { return this.profile.myProfile(ctx.userId); }

  @Query(() => SafetyHistoryConnectionType)
  mySafetyHistory(@Ctx() ctx: RequestContext, @Args('first', { type: () => Int, defaultValue: 20 }) first: number, @Args('after', { type: () => String, nullable: true }) after?: string) {
    return this.profile.mySafetyHistory(ctx.userId, first, after);
  }

  @Query(() => [HealthConditionCatalogType])
  healthConditions() { return this.profile.healthConditionCatalog(); }

  @Mutation(() => UserProfileDataType)
  updateProfile(@Ctx() ctx: RequestContext, @Args('input') input: UpdateProfileInputType) { return this.profile.updateProfile(ctx.userId, input); }

  @Mutation(() => UserGoalType)
  setGoal(@Ctx() ctx: RequestContext, @Args('input') input: SetGoalInputType) { return this.profile.setGoal(ctx.userId, input); }

  @Mutation(() => MyProfileType)
  async addAllergy(@Ctx() ctx: RequestContext, @Args('input') input: AllergyInputType) {
    await this.profile.addAllergy(ctx.userId, input);
    return this.profile.myProfile(ctx.userId);
  }

  @Mutation(() => Boolean)
  removeAllergy(@Ctx() ctx: RequestContext, @Args('input') input: RemoveAllergyInputType) { return this.profile.removeAllergy(ctx.userId, input); }

  @Mutation(() => MyProfileType)
  setHealthConditions(@Ctx() ctx: RequestContext, @Args('input') input: SetHealthConditionsInputType) { return this.profile.setHealthConditions(ctx.userId, input.conditions); }

  @Mutation(() => MyProfileType)
  setDietaryPreferences(@Ctx() ctx: RequestContext, @Args('input') input: SetDietaryPreferencesInputType) { return this.profile.setDietaryPreferences(ctx.userId, input.preferences); }
}
