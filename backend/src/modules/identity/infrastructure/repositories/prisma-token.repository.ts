import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { NewToken, TokenPurpose } from '@/modules/identity/domain/entities/identity.records.js';
import type { TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';

@Injectable()
export class PrismaTokenRepository implements TokenRepository {
  async insert(tx: Tx, t: NewToken): Promise<void> {
    await tx.token.create({ data: { id: t.id, userId: t.userId, purpose: t.purpose, tokenHash: t.tokenHash, expiresAt: t.expiresAt } });
  }

  async consumeByHash(tx: Tx, tokenHash: string, purpose: TokenPurpose) {
    const rows = await tx.$queryRaw<{ id: string; userId: string | null }[]>`
      UPDATE "Token" SET "usedAt" = now()
      WHERE "tokenHash" = ${tokenHash} AND "purpose" = ${purpose}::"TokenPurpose" AND "usedAt" IS NULL AND "expiresAt" > now()
      RETURNING "id", "userId"`;
    return rows[0] ?? null;
  }

  async consumeById(tx: Tx, id: string): Promise<boolean> {
    const n = await tx.$executeRaw`UPDATE "Token" SET "usedAt" = now() WHERE "id" = ${id}::uuid AND "usedAt" IS NULL AND "expiresAt" > now()`;
    return n === 1;
  }

  async isUsable(db: Tx, id: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ ok: boolean }[]>`SELECT true AS ok FROM "Token" WHERE "id" = ${id}::uuid AND "usedAt" IS NULL AND "expiresAt" > now()`;
    return rows.length === 1;
  }
}
