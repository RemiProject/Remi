import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { InvitationRevokedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_INVITATION_REPOSITORY, type HouseholdInvitationRepository } from '@/modules/identity/domain/ports/household-invitation.repository.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { InvitationNotFoundError, NotHouseholdOwnerError } from '@/modules/identity/domain/services/identity.errors.js';
import { RevokeInvitationCommand } from './revoke-invitation.command.js';

@CommandHandler(RevokeInvitationCommand)
export class RevokeInvitationHandler implements ICommandHandler<RevokeInvitationCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
    @Inject(HOUSEHOLD_INVITATION_REPOSITORY) private readonly invitations: HouseholdInvitationRepository,
  ) {}

  async execute({ userId, householdId, invitationId }: RevokeInvitationCommand): Promise<{ revoked: true }> {
    const me = await this.members.findActive(this.tx.db, householdId, userId);
    if (me?.role !== 'OWNER') throw new NotHouseholdOwnerError();

    await this.tx.run(async (tx) => {
      const inv = await this.invitations.lockOpenById(tx, householdId, invitationId);
      if (!inv) throw new InvitationNotFoundError();
      await this.invitations.markRevoked(tx, inv.id);
      await this.tokens.consumeById(tx, inv.tokenId); // kill the link as well
    }, { userId, householdId });

    this.eventBus.publish(new InvitationRevokedEvent(householdId, invitationId));
    return { revoked: true };
  }
}
