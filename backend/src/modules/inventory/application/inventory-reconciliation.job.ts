import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';

@Injectable()
export class InventoryReconciliationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryReconciliationJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly transactions: TransactionRunner) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runOnce(), 24 * 60 * 60 * 1000);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async runOnce(): Promise<void> {
    try {
      const discrepancies = await this.transactions.run(async (tx) => {
        const lock = await tx.$queryRaw<Array<{ got: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended('inventory_reconciliation', 0)) AS got`;
        if (!lock[0]?.got) return null;
        const households = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Household" ORDER BY "id"`;
        const found: Array<{ householdId: string; itemId: string; snapshot: string; ledger: string }> = [];
        for (const household of households) {
          await tx.$executeRaw`SELECT set_config('app.household_id', ${household.id}, true)`;
          const rows = await tx.$queryRaw<Array<{ itemId: string; snapshot: string; ledger: string }>>`
            SELECT i."id" AS "itemId", i."quantity"::text AS "snapshot",
                   COALESCE(sum(t."quantityDelta"), 0)::numeric(12,3)::text AS "ledger"
            FROM "InventoryItem" i LEFT JOIN "InventoryTransaction" t ON t."inventoryItemId" = i."id" AND t."householdId" = i."householdId"
            WHERE i."householdId" = ${household.id}::uuid
            GROUP BY i."id", i."quantity"
            HAVING i."quantity" <> COALESCE(sum(t."quantityDelta"), 0)`;
          found.push(...rows.map((row) => ({ ...row, householdId: household.id })));
        }
        return found;
      });
      if (discrepancies === null) return;
      if (discrepancies.length) this.logger.error({ count: discrepancies.length, discrepancies }, 'Inventory snapshot differs from ledger; no automatic correction was made');
      else this.logger.log('Inventory reconciliation completed with no discrepancies');
    } catch (error) {
      this.logger.error(error, 'Inventory reconciliation failed');
    }
  }
}
