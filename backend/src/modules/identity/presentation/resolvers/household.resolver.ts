import { UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { CreateHouseholdCommand } from '@/modules/identity/application/commands/create-household/create-household.command.js';
import { LeaveHouseholdCommand } from '@/modules/identity/application/commands/leave-household/leave-household.command.js';
import { TransferOwnershipCommand } from '@/modules/identity/application/commands/transfer-ownership/transfer-ownership.command.js';
import { RemoveMemberCommand } from '@/modules/identity/application/commands/remove-member/remove-member.command.js';
import { ListHouseholdMembersQuery } from '@/modules/identity/application/queries/list-household-members/list-household-members.query.js';
import { ListMyHouseholdsQuery } from '@/modules/identity/application/queries/list-my-households/list-my-households.query.js';
import { CreateHouseholdInput, RemoveMemberInput, TransferOwnershipInput } from '@/modules/identity/presentation/inputs/identity.inputs.js';
import { HouseholdMemberType, MyHouseholdType } from '@/modules/identity/presentation/types/identity.types.js';

@Resolver()
export class HouseholdResolver {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @UseGuards(GqlAuthGuard)
  @Mutation(() => String, { description: 'Returns the new household id' })
  async createHousehold(@Ctx() ctx: RequestContext, @Args('input') i: CreateHouseholdInput) {
    const { householdId } = await this.commandBus.execute(new CreateHouseholdCommand(ctx.userId, i.name, i.timezone));
    return householdId;
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [MyHouseholdType])
  myHouseholds(@Ctx() ctx: RequestContext) {
    return this.queryBus.execute(new ListMyHouseholdsQuery(ctx.userId));
  }

  @UseGuards(GqlAuthGuard, HouseholdGuard)
  @Query(() => [HouseholdMemberType], { description: 'Requires x-household-id header' })
  householdMembers(@Ctx() ctx: RequestContext) {
    return this.queryBus.execute(new ListHouseholdMembersQuery(ctx.householdId!));
  }

  @UseGuards(GqlAuthGuard, HouseholdGuard)
  @Mutation(() => Boolean)
  async leaveHousehold(@Ctx() ctx: RequestContext) {
    await this.commandBus.execute(new LeaveHouseholdCommand(ctx.userId, ctx.householdId!));
    return true;
  }

  @UseGuards(GqlAuthGuard, HouseholdGuard)
  @Mutation(() => Boolean)
  async removeMember(@Ctx() ctx: RequestContext, @Args('input') i: RemoveMemberInput) {
    await this.commandBus.execute(new RemoveMemberCommand(ctx.userId, ctx.householdId!, i.userId));
    return true;
  }

  @UseGuards(GqlAuthGuard, HouseholdGuard)
  @Mutation(() => Boolean, { description: 'OWNER only. The current owner becomes a MEMBER; the target member becomes the OWNER.' })
  async transferOwnership(@Ctx() ctx: RequestContext, @Args('input') i: TransferOwnershipInput) {
    await this.commandBus.execute(new TransferOwnershipCommand(ctx.userId, ctx.householdId!, i.newOwnerUserId));
    return true;
  }
}
