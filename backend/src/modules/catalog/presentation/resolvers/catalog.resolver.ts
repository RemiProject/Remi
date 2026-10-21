import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import { GetFoodQuery, SearchFoodsQuery } from '@/modules/catalog/application/queries/search-foods.query.js';
import { FoodConnectionType, FoodType } from '@/modules/catalog/presentation/types/catalog.types.js';

@Resolver()
export class CatalogResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query(() => FoodConnectionType)
  foods(
    @Args('search', { type: () => String, nullable: true }) search: string | undefined,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after: string | undefined,
  ) {
    return this.queryBus.execute(new SearchFoodsQuery(search, first, after));
  }

  @Query(() => FoodType, { nullable: true })
  food(@Args('id', { type: () => ID }) id: string) {
    return this.queryBus.execute(new GetFoodQuery(id));
  }
}
