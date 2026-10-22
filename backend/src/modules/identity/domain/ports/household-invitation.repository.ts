import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRole, InvitationForAccept, InvitationView } from '@/modules/identity/domain/entities/identity.records.js';

export const HOUSEHOLD_INVITATION_REPOSITORY = Symbol('HOUSEHOLD_INVITATION_REPOSITORY');

export interface HouseholdInvitationRepository {
  insert(tx: Tx, inv: { id: string; householdId: string; invitedByUserId: string; tokenId: string; email: string; role: HouseholdRole }): Promise<void>;
  /** Locks the invitation row (FOR UPDATE) found by its token hash. */
  lockByTokenHash(tx: Tx, tokenHash: string): Promise<InvitationForAccept | null>;
  /** Locks an invitation of this household by id; returns its tokenId when still open. */
  lockOpenById(tx: Tx, householdId: string, id: string): Promise<{ id: string; tokenId: string } | null>;
  markAccepted(tx: Tx, id: string): Promise<void>;
  markRevoked(tx: Tx, id: string): Promise<void>;
  listOpen(db: Tx, householdId: string): Promise<InvitationView[]>;
}
