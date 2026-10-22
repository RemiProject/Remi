import { Command } from '@nestjs/cqrs';

export class TransferOwnershipCommand extends Command<{ transferred: true }> {
  constructor(public readonly userId: string, public readonly householdId: string, public readonly newOwnerUserId: string) { super(); }
}
