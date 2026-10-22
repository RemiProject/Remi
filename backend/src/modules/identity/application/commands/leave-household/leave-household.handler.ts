import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { MemberLeftEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { NotHouseholdMemberError, OwnerCannotLeaveError } from '@/modules/identity/domain/services/identity.errors.js';
import { LeaveHouseholdCommand } from './leave-household.command.js';

@CommandHandler(LeaveHouseholdCommand)
export class LeaveHouseholdHandler implements ICommandHandler<LeaveHouseholdCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  async execute({ userId, householdId }: LeaveHouseholdCommand): Promise<{ left: true }> {
    await this.tx.run(async (tx) => {
      await this.households.lock(tx, householdId);
      const me = await this.members.findActive(tx, householdId, userId);
      if (!me) throw new NotHouseholdMemberError();
      // Ownership transfer is out of scope for phase 1, so the owner can't leave (a household must keep exactly one active OWNER).
      if (me.role === 'OWNER') throw new OwnerCannotLeaveError();
      await this.members.markLeft(tx, householdId, userId);
    }, { userId, householdId });

    this.eventBus.publish(new MemberLeftEvent(householdId, userId));
    return { left: true };
  }
}
