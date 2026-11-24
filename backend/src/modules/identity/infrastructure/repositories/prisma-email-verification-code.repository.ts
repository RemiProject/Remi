import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { EmailVerificationCodeRecord, EmailVerificationCodeRepository } from '@/modules/identity/domain/ports/email-verification-code.repository.js';

@Injectable()
export class PrismaEmailVerificationCodeRepository implements EmailVerificationCodeRepository {
  async lockAccount(tx: Tx, userId: string) {
    const rows = await tx.$queryRaw<Array<{ emailVerifiedAt: Date | null; deletedAt: Date | null }>>`
      SELECT "emailVerifiedAt", "deletedAt" FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async issuanceHistory(tx: Tx, userId: string, now: Date, windowMs: number) {
    const [row] = await tx.$queryRaw<Array<{ lastIssuedAt: Date | null; count: number }>>`
      SELECT max("createdAt") AS "lastIssuedAt",
        count(*) FILTER (WHERE "createdAt" > ${new Date(now.getTime() - windowMs)} AND "createdAt" <= ${now})::int AS count
      FROM "EmailVerificationCode" WHERE "userId" = ${userId}::uuid`;
    return row;
  }

  findOpen(tx: Tx, userId: string) {
    return tx.emailVerificationCode.findFirst({ where: { userId, usedAt: null, invalidatedAt: null } });
  }

  recentCodes(tx: Tx, userId: string, since: Date) {
    return tx.emailVerificationCode.findMany({ where: { userId, createdAt: { gt: since } }, select: { id: true, codeHash: true } });
  }

  async invalidateOpen(tx: Tx, userId: string, now: Date) {
    await tx.emailVerificationCode.updateMany({ where: { userId, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } });
  }

  async insert(tx: Tx, row: EmailVerificationCodeRecord) {
    await tx.emailVerificationCode.create({ data: row });
  }

  async recordFailure(tx: Tx, id: string, attempts: number, invalidatedAt: Date | null) {
    await tx.emailVerificationCode.update({ where: { id }, data: { failedAttempts: attempts, invalidatedAt } });
  }

  async consume(tx: Tx, id: string, now: Date) {
    await tx.emailVerificationCode.update({ where: { id }, data: { usedAt: now } });
  }
}
