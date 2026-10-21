import type { Tx } from '@/platform/db/tx-context.js';
import type { FoodConnection, FoodRow } from '@/modules/catalog/domain/food.types.js';

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogRepository {
  search(db: Tx, search: string | undefined, first: number, afterId: string | undefined): Promise<FoodConnection>;
  findById(db: Tx, id: string): Promise<FoodRow | null>;
}
