import { Command } from '@nestjs/cqrs';
import type { HouseholdRole } from '@/modules/identity/domain/entities/identity.records.js';

export class InviteMemberCommand extends Command<{ invitationId: string }> {
  constructor(
    public readonly userId: string,
    public readonly householdId: string,
    public readonly email: string,
    public readonly role: HouseholdRole = 'MEMBER',
  ) { super(); }
}
