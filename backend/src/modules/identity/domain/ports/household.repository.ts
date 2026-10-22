import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRecord } from '@/modules/identity/domain/entities/identity.records.js';

export const HOUSEHOLD_REPOSITORY = Symbol('HOUSEHOLD_REPOSITORY');

export interface HouseholdRepository {
  insert(tx: Tx, household: HouseholdRecord): Promise<void>;
  findById(db: Tx, id: string): Promise<HouseholdRecord | null>;
  /** SELECT … FOR UPDATE: serializes concurrent joins / leaves of the same household. */
  lock(tx: Tx, id: string): Promise<void>;
}
