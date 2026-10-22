import { Command } from '@nestjs/cqrs';

export class LeaveHouseholdCommand extends Command<{ left: true }> {
  constructor(public readonly userId: string, public readonly householdId: string) { super(); }
}
