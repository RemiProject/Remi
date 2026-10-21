import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { HouseholdRecord } from '@/modules/identity/domain/entities/identity.records.js';
import type { HouseholdRepository } from '@/modules/identity/domain/ports/household.repository.js';

@Injectable()
export class PrismaHouseholdRepository implements HouseholdRepository {
  async insert(tx: Tx, h: HouseholdRecord): Promise<void> {
    await tx.household.create({ data: h });
  }

  findById(db: Tx, id: string): Promise<HouseholdRecord | null> {
    return db.household.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, timezone: true } });
  }

  async lock(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "Household" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }
}
