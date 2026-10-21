import { Command } from '@nestjs/cqrs';

export class RemoveMemberCommand extends Command<{ removed: true }> {
  constructor(public readonly userId: string, public readonly householdId: string, public readonly targetUserId: string) { super(); }
}
