import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { MemberLeftEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { CannotRemoveOwnerError, MemberNotFoundError, NotHouseholdOwnerError } from '@/modules/identity/domain/services/identity.errors.js';
import { RemoveMemberCommand } from './remove-member.command.js';

@CommandHandler(RemoveMemberCommand)
export class RemoveMemberHandler implements ICommandHandler<RemoveMemberCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  async execute({ userId, householdId, targetUserId }: RemoveMemberCommand): Promise<{ removed: true }> {
    const me = await this.members.findActive(this.tx.db, householdId, userId);
    if (me?.role !== 'OWNER') throw new NotHouseholdOwnerError();
    if (targetUserId === userId) throw new CannotRemoveOwnerError();

    await this.tx.run(async (tx) => {
      await this.households.lock(tx, householdId);
      const target = await this.members.findActive(tx, householdId, targetUserId);
      if (!target) throw new MemberNotFoundError();
      if (target.role === 'OWNER') throw new CannotRemoveOwnerError();
      await this.members.markLeft(tx, householdId, targetUserId); // leaving = fill leftAt, never DELETE
    }, { userId, householdId });

    this.eventBus.publish(new MemberLeftEvent(householdId, targetUserId, userId));
    return { removed: true };
  }
}
