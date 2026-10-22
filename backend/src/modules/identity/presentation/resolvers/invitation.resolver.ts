import { UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { HouseholdRoles, RolesGuard } from '@/platform/tenancy/roles.guard.js';
import { InviteMemberCommand } from '@/modules/identity/application/commands/invite-member/invite-member.command.js';
import { RevokeInvitationCommand } from '@/modules/identity/application/commands/revoke-invitation/revoke-invitation.command.js';
import { ListHouseholdInvitationsQuery } from '@/modules/identity/application/queries/list-household-invitations/list-household-invitations.query.js';
import { InviteMemberInput, RevokeInvitationInput } from '@/modules/identity/presentation/inputs/identity.inputs.js';
import { InvitationType } from '@/modules/identity/presentation/types/identity.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard, RolesGuard)
@HouseholdRoles('OWNER')
export class InvitationResolver {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Mutation(() => String, { description: 'Returns the invitation id. Requires x-household-id and the OWNER role' })
  async inviteMember(@Ctx() ctx: RequestContext, @Args('input') i: InviteMemberInput) {
    const { invitationId } = await this.commandBus.execute(new InviteMemberCommand(ctx.userId, ctx.householdId!, i.email, i.role));
    return invitationId;
  }

  @Mutation(() => Boolean)
  async revokeInvitation(@Ctx() ctx: RequestContext, @Args('input') i: RevokeInvitationInput) {
    await this.commandBus.execute(new RevokeInvitationCommand(ctx.userId, ctx.householdId!, i.invitationId));
    return true;
  }

  @Query(() => [InvitationType])
  householdInvitations(@Ctx() ctx: RequestContext) {
    return this.queryBus.execute(new ListHouseholdInvitationsQuery(ctx.householdId!));
  }
}
