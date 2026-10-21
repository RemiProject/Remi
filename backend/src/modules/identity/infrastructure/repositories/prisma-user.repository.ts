import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { UserRecord } from '@/modules/identity/domain/entities/identity.records.js';
import type { NewUser, UserRepository } from '@/modules/identity/domain/ports/user.repository.js';

const select = {
  id: true, email: true, passwordHash: true, name: true, timezone: true, emailVerifiedAt: true,
  preferredLanguage: { select: { code: true } },
} as const;

const toRecord = (r: any): UserRecord => ({
  id: r.id, email: r.email, passwordHash: r.passwordHash, name: r.name, timezone: r.timezone,
  emailVerifiedAt: r.emailVerifiedAt, languageCode: r.preferredLanguage.code,
});

@Injectable()
export class PrismaUserRepository implements UserRepository {
  async create(tx: Tx, user: NewUser): Promise<void> {
    await tx.user.create({ data: user });
  }

  async findByEmail(db: Tx, email: string): Promise<UserRecord | null> {
    const r = await db.user.findFirst({ where: { email, deletedAt: null }, select });
    return r ? toRecord(r) : null;
  }

  async findById(db: Tx, id: string): Promise<UserRecord | null> {
    const r = await db.user.findFirst({ where: { id, deletedAt: null }, select });
    return r ? toRecord(r) : null;
  }

  async touchLogin(tx: Tx, id: string): Promise<void> {
    await tx.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  async markEmailVerified(tx: Tx, id: string): Promise<void> {
    await tx.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }

  async updatePassword(tx: Tx, id: string, passwordHash: string): Promise<void> {
    await tx.user.update({ where: { id }, data: { passwordHash } });
  }
}
