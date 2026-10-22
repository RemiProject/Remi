import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OwnershipTransferredEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { CannotTransferToSelfError, MemberNotFoundError, NotHouseholdOwnerError } from '@/modules/identity/domain/services/identity.errors.js';
import { TransferOwnershipCommand } from './transfer-ownership.command.js';

@CommandHandler(TransferOwnershipCommand)
export class TransferOwnershipHandler implements ICommandHandler<TransferOwnershipCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  async execute({ userId, householdId, newOwnerUserId }: TransferOwnershipCommand): Promise<{ transferred: true }> {
    if (newOwnerUserId === userId) throw new CannotTransferToSelfError();
    await this.tx.run(async (tx) => {
      // Household row lock serializes transfer / leave / remove, so the "one active OWNER" UQ never races.
      await this.households.lock(tx, householdId);
      const me = await this.members.findActive(tx, householdId, userId);
      if (me?.role !== 'OWNER') throw new NotHouseholdOwnerError();
      const target = await this.members.findActive(tx, householdId, newOwnerUserId);
      if (!target) throw new MemberNotFoundError();
      // Demote first: the partial UQ allows only one active OWNER at any instant.
      await this.members.setRole(tx, householdId, userId, 'MEMBER');
      await this.members.setRole(tx, householdId, newOwnerUserId, 'OWNER');
    }, { userId, householdId });

    this.eventBus.publish(new OwnershipTransferredEvent(householdId, userId, newOwnerUserId));
    return { transferred: true };
  }
}
