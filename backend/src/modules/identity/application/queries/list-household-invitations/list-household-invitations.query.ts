import { Query } from '@nestjs/cqrs';
import type { InvitationView } from '@/modules/identity/domain/entities/identity.records.js';

export class ListHouseholdInvitationsQuery extends Query<InvitationView[]> {
  constructor(public readonly householdId: string) { super(); }
}
