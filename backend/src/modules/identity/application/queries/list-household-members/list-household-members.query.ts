import { Query } from '@nestjs/cqrs';
import type { MemberView } from '@/modules/identity/domain/entities/identity.records.js';

export class ListHouseholdMembersQuery extends Query<MemberView[]> {
  constructor(public readonly householdId: string) { super(); }
}
