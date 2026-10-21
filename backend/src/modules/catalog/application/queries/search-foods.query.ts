import { Query } from '@nestjs/cqrs';
import type { FoodConnection } from '@/modules/catalog/domain/food.types.js';

export class SearchFoodsQuery extends Query<FoodConnection> {
  constructor(public readonly search: string | undefined, public readonly first: number, public readonly after: string | undefined) { super(); }
}

export class GetFoodQuery extends Query<import('@/modules/catalog/domain/food.types.js').FoodRow | null> {
  constructor(public readonly id: string) { super(); }
}
