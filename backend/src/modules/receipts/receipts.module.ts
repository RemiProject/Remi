import { Module } from '@nestjs/common';
import { InventoryModule } from '@/modules/inventory/inventory.module.js';
import { ReceiptService } from './application/receipt.service.js';
import { ReceiptResolver } from './presentation/receipt.resolver.js';

@Module({ imports: [InventoryModule], providers: [ReceiptService, ReceiptResolver] })
export class ReceiptsModule {}
