import { Module } from '@nestjs/common';
import { GetFoodHandler, SearchFoodsHandler } from './application/queries/search-foods.handler.js';
import { CatalogResolver } from './presentation/resolvers/catalog.resolver.js';
import { UnitsModule } from '@/modules/units/units.module.js';
import { CATALOG_REPOSITORY } from './domain/ports/catalog.repository.js';
import { PrismaCatalogRepository } from './infrastructure/repositories/prisma-catalog.repository.js';

@Module({
  imports: [UnitsModule],
  providers: [
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
    SearchFoodsHandler,
    GetFoodHandler,
    CatalogResolver,
  ],
})
export class CatalogModule {}
