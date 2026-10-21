import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRole, MemberView, MembershipRecord, MyHouseholdView } from '@/modules/identity/domain/entities/identity.records.js';
import type { HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';

@Injectable()
export class PrismaHouseholdMemberRepository implements HouseholdMemberRepository {
  async findActive(db: Tx, householdId: string, userId: string): Promise<MembershipRecord | null> {
    const m = await db.householdMember.findFirst({ where: { householdId, userId, leftAt: null, household: { deletedAt: null } } });
    return m ? { householdId: m.householdId, userId: m.userId, role: m.role, joinedAt: m.joinedAt, leftAt: m.leftAt } : null;
  }

  async insert(tx: Tx, m: { id: string; householdId: string; userId: string; role: HouseholdRole }): Promise<void> {
    await tx.householdMember.create({ data: m });
  }

  async joinOrRejoin(tx: Tx, m: { id: string; householdId: string; userId: string; role: HouseholdRole }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role")
      VALUES (${m.id}::uuid, ${m.householdId}::uuid, ${m.userId}::uuid, ${m.role}::"HouseholdRole")
      ON CONFLICT ("householdId", "userId") DO UPDATE SET "leftAt" = NULL, "joinedAt" = now(), "role" = EXCLUDED."role"`;
  }

  async markLeft(tx: Tx, householdId: string, userId: string): Promise<void> {
    await tx.householdMember.updateMany({ where: { householdId, userId, leftAt: null }, data: { leftAt: new Date() } });
  }

  async listActive(db: Tx, householdId: string): Promise<MemberView[]> {
    const rows = await db.householdMember.findMany({
      where: { householdId, leftAt: null },
      select: { role: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email, role: r.role, joinedAt: r.joinedAt }));
  }

  async listHouseholdsOfUser(db: Tx, userId: string): Promise<MyHouseholdView[]> {
    const rows = await db.householdMember.findMany({
      where: { userId, leftAt: null, household: { deletedAt: null } },
      select: { role: true, joinedAt: true, household: { select: { id: true, name: true, timezone: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((r) => ({ household: r.household, role: r.role, joinedAt: r.joinedAt }));
  }

  async isActiveMemberByEmail(db: Tx, householdId: string, email: string): Promise<boolean> {
    const n = await db.householdMember.count({ where: { householdId, leftAt: null, user: { email, deletedAt: null } } });
    return n > 0;
  }
}
