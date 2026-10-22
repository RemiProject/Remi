import { Query } from '@nestjs/cqrs';
import type { HouseholdRoleName } from './request-context.js';

export interface ActiveMembership {
  householdId: string;
  userId: string;
  role: HouseholdRoleName;
}

/** Contract owned by tenancy, answered by the identity module — keeps platform independent of identity. */
export class GetActiveMembershipQuery extends Query<ActiveMembership | null> {
  constructor(
    public readonly userId: string,
    public readonly householdId: string,
  ) {
    super();
  }
}
