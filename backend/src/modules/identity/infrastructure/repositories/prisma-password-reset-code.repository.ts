import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { PasswordResetCodeRecord, PasswordResetCodeRepository } from '@/modules/identity/domain/ports/password-reset-code.repository.js';

@Injectable()
export class PrismaPasswordResetCodeRepository implements PasswordResetCodeRepository {
  async lockAccount(tx: Tx, userId: string) {
    const rows = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
      SELECT "deletedAt" FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async issuanceHistory(tx: Tx, userId: string, now: Date, windowMs: number) {
    const [row] = await tx.$queryRaw<Array<{ lastIssuedAt: Date | null; count: number }>>`
      SELECT max("createdAt") AS "lastIssuedAt",
        count(*) FILTER (WHERE "createdAt" > ${new Date(now.getTime() - windowMs)} AND "createdAt" <= ${now})::int AS count
      FROM "PasswordResetCode" WHERE "userId" = ${userId}::uuid`;
    return row;
  }

  async failedAttemptsSince(tx: Tx, userId: string, since: Date) {
    const [row] = await tx.$queryRaw<Array<{ failures: number }>>`
      SELECT coalesce(sum("failedAttempts"), 0)::int AS failures
      FROM "PasswordResetCode" WHERE "userId" = ${userId}::uuid AND "createdAt" > ${since}`;
    return row.failures;
  }

  findOpen(tx: Tx, userId: string) {
    return tx.passwordResetCode.findFirst({ where: { userId, codeHash: { not: null }, usedAt: null, invalidatedAt: null } });
  }

  findById(tx: Tx, id: string) {
    return tx.passwordResetCode.findUnique({ where: { id } });
  }

  async recentCodes(tx: Tx, userId: string, since: Date) {
    const rows = await tx.passwordResetCode.findMany({ where: { userId, codeHash: { not: null }, createdAt: { gt: since } }, select: { id: true, codeHash: true } });
    return rows.map(row => ({ id: row.id, codeHash: row.codeHash! }));
  }

  async invalidateOpen(tx: Tx, userId: string, now: Date) {
    await tx.passwordResetCode.updateMany({ where: { userId, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } });
  }

  async insert(tx: Tx, row: PasswordResetCodeRecord) {
    await tx.passwordResetCode.create({ data: row });
  }

  async recordFailure(tx: Tx, id: string, attempts: number, invalidatedAt: Date | null) {
    await tx.passwordResetCode.update({ where: { id }, data: { failedAttempts: attempts, invalidatedAt } });
  }

  async consume(tx: Tx, id: string, now: Date) {
    await tx.passwordResetCode.update({ where: { id }, data: { usedAt: now } });
  }
}
