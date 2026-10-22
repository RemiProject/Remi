import { createUnionType, Field, Float, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum SearchDocumentSourceType { FOOD = 'FOOD', RECIPE = 'RECIPE', MEAL = 'MEAL' }
registerEnumType(SearchDocumentSourceType, { name: 'SearchDocumentType' });

@ObjectType('SearchFoodResult')
export class SearchFoodResultType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() categoryName!: string;
  @Field() defaultUnit!: string;
  @Field(() => [String]) safetyWarnings!: string[];
  @Field(() => Float) score!: number;
}

@ObjectType('SearchRecipeResult')
export class SearchRecipeResultType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => [String]) safetyWarnings!: string[];
  @Field(() => Float) score!: number;
}

@ObjectType('SearchMealResult')
export class SearchMealResultType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => Date) eatenAt!: Date;
  @Field() mealType!: string;
  @Field(() => [String]) safetyWarnings!: string[];
  @Field(() => Float) score!: number;
}

export const SearchResultUnion = createUnionType({
  name: 'SearchResult',
  types: () => [SearchFoodResultType, SearchRecipeResultType, SearchMealResultType] as const,
  resolveType: (value) => value.__typename,
});
