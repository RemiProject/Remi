import { Command } from '@nestjs/cqrs';

export class AcceptInvitationCommand extends Command<{ householdId: string }> {
  constructor(public readonly userId: string, public readonly token: string) { super(); }
}
