import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { newId } from '@/shared/ids.js';
import { isValidTimezone } from '@/shared/timezone.js';
import { HouseholdCreatedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { InvalidTimezoneError, UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { CreateHouseholdCommand } from './create-household.command.js';

@CommandHandler(CreateHouseholdCommand)
export class CreateHouseholdHandler implements ICommandHandler<CreateHouseholdCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  async execute({ userId, name, timezone }: CreateHouseholdCommand): Promise<{ householdId: string }> {
    const user = await this.users.findById(this.tx.db, userId);
    if (!user) throw new UserNotFoundError();
    // Household timezone defaults to the creator's timezone; the OWNER can change it later.
    const tz = timezone ?? user.timezone;
    if (!isValidTimezone(tz)) throw new InvalidTimezoneError();

    const householdId = newId();
    await this.tx.run(async (tx) => {
      await this.households.insert(tx, { id: householdId, name: name.trim(), timezone: tz });
      await this.members.insert(tx, { id: newId(), householdId, userId, role: 'OWNER' });
    }, { userId, householdId });

    this.eventBus.publish(new HouseholdCreatedEvent(householdId, userId));
    return { householdId };
  }
}
