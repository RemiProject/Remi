import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Country') export class CountryType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string }
@ObjectType('Cuisine') export class CuisineType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string }
@ObjectType('FoodCategory') export class FoodCategoryType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string }
@ObjectType('Language') export class LanguageType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string; @Field() isRtl!: boolean }
@ObjectType('Locale') export class LocaleType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string; @Field() languageCode!: string }
@ObjectType('Currency') export class CurrencyType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string; @Field() symbol!: string; @Field(() => Int) decimalPlaces!: number }
