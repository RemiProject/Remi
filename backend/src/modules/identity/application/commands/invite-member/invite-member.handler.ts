import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { isUniqueViolation } from '@/shared/db-errors.js';
import { newId } from '@/shared/ids.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { MemberInvitedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { HOUSEHOLD_INVITATION_REPOSITORY, type HouseholdInvitationRepository } from '@/modules/identity/domain/ports/household-invitation.repository.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { AlreadyMemberError, InvitationAlreadyOpenError, NotHouseholdOwnerError, UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { InviteMemberCommand } from './invite-member.command.js';

@CommandHandler(InviteMemberCommand)
export class InviteMemberHandler implements ICommandHandler<InviteMemberCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: EventBus,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
    @Inject(HOUSEHOLD_INVITATION_REPOSITORY) private readonly invitations: HouseholdInvitationRepository,
  ) {}

  async execute(cmd: InviteMemberCommand): Promise<{ invitationId: string }> {
    const db = this.tx.db;
    const inviter = await this.members.findActive(db, cmd.householdId, cmd.userId);
    if (inviter?.role !== 'OWNER') throw new NotHouseholdOwnerError();

    const [household, inviterUser] = await Promise.all([this.households.findById(db, cmd.householdId), this.users.findById(db, cmd.userId)]);
    if (!household || !inviterUser) throw new UserNotFoundError();

    const email = normalizeEmail(cmd.email);
    if (await this.members.isActiveMemberByEmail(db, cmd.householdId, email)) throw new AlreadyMemberError();

    const issued = this.tokens.issue('HOUSEHOLD_INVITATION', null); // invitee may not have an account yet
    const invitationId = newId();
    try {
      await this.tx.run(async (tx) => {
        await this.tokenRepo.insert(tx, issued.row);
        await this.invitations.insert(tx, { id: invitationId, householdId: cmd.householdId, invitedByUserId: cmd.userId, tokenId: issued.row.id, email, role: cmd.role });
        await this.outbox.publish(tx, {
          topic: OutboxTopics.HouseholdInvitationCreated,
          dedupeKey: invitationId,
          householdId: cmd.householdId,
          payload: {
            tokenId: issued.row.id,
            to: email,
            lang: inviterUser.languageCode, // invitee may have no account: use the inviter's language
            inviterName: inviterUser.name,
            householdName: household.name,
            role: cmd.role,
            acceptUrl: this.links.acceptInvitation(issued.raw),
            expiresInDays: this.config.env.INVITATION_TTL_DAYS,
          },
        });
      }, { userId: cmd.userId, householdId: cmd.householdId });
    } catch (err) {
      if (isUniqueViolation(err)) throw new InvitationAlreadyOpenError();
      throw err;
    }

    this.eventBus.publish(new MemberInvitedEvent(cmd.householdId, invitationId, email));
    return { invitationId };
  }
}
