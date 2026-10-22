import { Command } from '@nestjs/cqrs';

export class CreateHouseholdCommand extends Command<{ householdId: string }> {
  constructor(public readonly userId: string, public readonly name: string, public readonly timezone?: string) { super(); }
}
