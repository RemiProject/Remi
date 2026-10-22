import { Command } from '@nestjs/cqrs';

export class RevokeInvitationCommand extends Command<{ revoked: true }> {
  constructor(public readonly userId: string, public readonly householdId: string, public readonly invitationId: string) { super(); }
}
