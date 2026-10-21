import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module.js';
import { InventoryLedgerService } from './application/inventory-ledger.service.js';
import { InventoryReconciliationJob } from './application/inventory-reconciliation.job.js';
import { InventoryResolver } from './presentation/inventory.resolver.js';

@Module({ imports: [UnitsModule], providers: [InventoryLedgerService, InventoryReconciliationJob, InventoryResolver], exports: [InventoryLedgerService, InventoryReconciliationJob] })
export class InventoryModule {}
