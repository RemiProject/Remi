import { Module } from '@nestjs/common';
import { InventoryModule } from '@/modules/inventory/inventory.module.js';
import { ShoppingService } from './application/shopping.service.js';
import { ShoppingResolver } from './presentation/shopping.resolver.js';

@Module({ imports: [InventoryModule], providers: [ShoppingService, ShoppingResolver], exports: [ShoppingService] })
export class ShoppingModule {}
