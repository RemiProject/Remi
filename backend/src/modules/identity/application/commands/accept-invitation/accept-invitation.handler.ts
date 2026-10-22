import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { newId } from '@/shared/ids.js';
import { MemberJoinedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_INVITATION_REPOSITORY, type HouseholdInvitationRepository } from '@/modules/identity/domain/ports/household-invitation.repository.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { EmailNotVerifiedError, InvalidTokenError, InvitationEmailMismatchError, InvitationNotUsableError, UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { AcceptInvitationCommand } from './accept-invitation.command.js';

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<AcceptInvitationCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
    @Inject(HOUSEHOLD_INVITATION_REPOSITORY) private readonly invitations: HouseholdInvitationRepository,
  ) {}

  async execute({ userId, token }: AcceptInvitationCommand): Promise<{ householdId: string }> {
    const user = await this.users.findById(this.tx.db, userId);
    if (!user) throw new UserNotFoundError();
    if (this.config.env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt) throw new EmailNotVerifiedError();

    const householdId = await this.tx.run(async (tx) => {
      const inv = await this.invitations.lockByTokenHash(tx, hashToken(token));
      if (!inv) throw new InvalidTokenError();
      if (inv.acceptedAt || inv.revokedAt || inv.tokenUsedAt || inv.tokenExpiresAt <= new Date()) throw new InvitationNotUsableError();
      if (inv.email !== user.email) throw new InvitationEmailMismatchError();

      await this.households.lock(tx, inv.householdId); // serializes concurrent joins
      if (!(await this.tokens.consumeById(tx, inv.tokenId))) throw new InvitationNotUsableError();
      await this.members.joinOrRejoin(tx, { id: newId(), householdId: inv.householdId, userId, role: inv.role });
      await this.invitations.markAccepted(tx, inv.id);
      return inv.householdId;
    }, { userId });

    this.eventBus.publish(new MemberJoinedEvent(householdId, userId));
    return { householdId };
  }
}
