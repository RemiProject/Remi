import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRole, MemberView, MembershipRecord, MyHouseholdView } from '@/modules/identity/domain/entities/identity.records.js';

export const HOUSEHOLD_MEMBER_REPOSITORY = Symbol('HOUSEHOLD_MEMBER_REPOSITORY');

export interface HouseholdMemberRepository {
  findActive(db: Tx, householdId: string, userId: string): Promise<MembershipRecord | null>;
  insert(tx: Tx, member: { id: string; householdId: string; userId: string; role: HouseholdRole }): Promise<void>;
  /** ON CONFLICT (householdId, userId) DO UPDATE SET leftAt = NULL — "rejoin clears leftAt". */
  joinOrRejoin(tx: Tx, member: { id: string; householdId: string; userId: string; role: HouseholdRole }): Promise<void>;
  markLeft(tx: Tx, householdId: string, userId: string): Promise<void>;
  listActive(db: Tx, householdId: string): Promise<MemberView[]>;
  listHouseholdsOfUser(db: Tx, userId: string): Promise<MyHouseholdView[]>;
  isActiveMemberByEmail(db: Tx, householdId: string, email: string): Promise<boolean>;
}
