import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { NewSession, SessionRepository, SessionRow } from '@/modules/identity/domain/ports/session.repository.js';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  async insert(tx: Tx, s: NewSession): Promise<void> {
    await tx.session.create({
      data: {
        id: s.id,
        userId: s.userId,
        familyId: s.familyId,
        refreshTokenHash: s.refreshTokenHash,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent ?? null,
      },
    });
  }

  async findByRefreshHashForUpdate(tx: Tx, refreshTokenHash: string): Promise<SessionRow | null> {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT "id", "userId", "familyId", "refreshTokenHash", "expiresAt", "rotatedAt", "revokedAt"
      FROM "Session"
      WHERE "refreshTokenHash" = ${refreshTokenHash}
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  async rotate(tx: Tx, args: { currentId: string; next: NewSession }): Promise<void> {
    await tx.$executeRaw`
      UPDATE "Session"
      SET "rotatedAt" = now(), "lastUsedAt" = now()
      WHERE "id" = ${args.currentId}::uuid AND "rotatedAt" IS NULL AND "revokedAt" IS NULL`;
    await this.insert(tx, args.next);
  }

  async revokeFamily(tx: Tx, familyId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE "Session"
      SET "revokedAt" = now()
      WHERE "familyId" = ${familyId}::uuid AND "revokedAt" IS NULL`;
  }

  async revokeById(tx: Tx, userId: string, sessionId: string): Promise<boolean> {
    const n = await tx.$executeRaw`
      UPDATE "Session"
      SET "revokedAt" = now()
      WHERE "id" = ${sessionId}::uuid AND "userId" = ${userId}::uuid AND "revokedAt" IS NULL`;
    return n === 1;
  }

  async revokeAllForUser(tx: Tx, userId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE "Session"
      SET "revokedAt" = now()
      WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL`;
  }

  async touchLastUsed(tx: Tx, id: string): Promise<void> {
    await tx.$executeRaw`UPDATE "Session" SET "lastUsedAt" = now() WHERE "id" = ${id}::uuid`;
  }

  async isActive(db: Tx, sessionId: string, userId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ ok: boolean }[]>`
      SELECT true AS ok
      FROM "Session"
      WHERE "id" = ${sessionId}::uuid
        AND "userId" = ${userId}::uuid
        AND "revokedAt" IS NULL
        AND "expiresAt" > now()`;
    return rows.length === 1;
  }
}
