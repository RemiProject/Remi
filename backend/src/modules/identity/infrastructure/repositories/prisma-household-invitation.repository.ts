import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRole, InvitationForAccept, InvitationView } from '@/modules/identity/domain/entities/identity.records.js';
import type { HouseholdInvitationRepository } from '@/modules/identity/domain/ports/household-invitation.repository.js';

@Injectable()
export class PrismaHouseholdInvitationRepository implements HouseholdInvitationRepository {
  async insert(tx: Tx, inv: { id: string; householdId: string; invitedByUserId: string; tokenId: string; email: string; role: HouseholdRole }): Promise<void> {
    await tx.householdInvitation.create({ data: inv });
  }

  async lockByTokenHash(tx: Tx, tokenHash: string): Promise<InvitationForAccept | null> {
    const rows = await tx.$queryRaw<InvitationForAccept[]>`
      SELECT i."id", i."householdId", i."email", i."role", i."acceptedAt", i."revokedAt",
             t."id" AS "tokenId", t."usedAt" AS "tokenUsedAt", t."expiresAt" AS "tokenExpiresAt"
      FROM "Token" t JOIN "HouseholdInvitation" i ON i."tokenId" = t."id"
      WHERE t."tokenHash" = ${tokenHash} AND t."purpose" = 'HOUSEHOLD_INVITATION'::"TokenPurpose"
      FOR UPDATE OF i`;
    return rows[0] ?? null;
  }

  async lockOpenById(tx: Tx, householdId: string, id: string): Promise<{ id: string; tokenId: string } | null> {
    const rows = await tx.$queryRaw<{ id: string; tokenId: string }[]>`
      SELECT "id", "tokenId" FROM "HouseholdInvitation"
      WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  async markAccepted(tx: Tx, id: string): Promise<void> {
    await tx.householdInvitation.update({ where: { id }, data: { acceptedAt: new Date() } });
  }

  async markRevoked(tx: Tx, id: string): Promise<void> {
    await tx.householdInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  listOpen(db: Tx, householdId: string): Promise<InvitationView[]> {
    return db.householdInvitation.findMany({
      where: { householdId, acceptedAt: null, revokedAt: null, token: { usedAt: null, expiresAt: { gt: new Date() } } },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
