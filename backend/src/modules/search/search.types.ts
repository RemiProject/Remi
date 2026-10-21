import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum SearchDocumentSourceType { FOOD = 'FOOD', RECIPE = 'RECIPE', MEAL = 'MEAL' }
registerEnumType(SearchDocumentSourceType, { name: 'SearchDocumentType' });

@ObjectType('SearchResult')
export class SearchResultType {
  @Field(() => ID) id!: string;
  @Field(() => SearchDocumentSourceType) type!: SearchDocumentSourceType;
  @Field() title!: string;
  @Field() excerpt!: string;
  @Field() score!: number;
}
