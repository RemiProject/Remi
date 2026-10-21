import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

registerEnumType(Unit, { name: 'Unit' });

@InputType('QuantityInput')
export class QuantityInput {
  @Field(() => DecimalScalar) amount!: string;
  @Field(() => Unit) unit!: Unit;
}

@ObjectType('FoodAlias')
export class FoodAliasType {
  @Field(() => ID) id!: string;
  @Field() alias!: string;
  @Field() isPrimary!: boolean;
  @Field() languageCode!: string;
}

@ObjectType('NutritionProfile')
export class NutritionProfileType {
  @Field(() => DecimalScalar) caloriesPer100g!: string;
  @Field(() => DecimalScalar) proteinG!: string;
  @Field(() => DecimalScalar) carbsG!: string;
  @Field(() => DecimalScalar) fatG!: string;
  @Field(() => DecimalScalar) fiberG!: string;
  @Field(() => DecimalScalar) sugarG!: string;
  @Field(() => DecimalScalar) sodiumMg!: string;
}

@ObjectType('CatalogFoodCategory')
export class CatalogFoodCategoryType {
  @Field(() => ID) id!: string;
  @Field() code!: string;
  @Field() name!: string;
}

@ObjectType('Food')
export class FoodType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => CatalogFoodCategoryType) category!: CatalogFoodCategoryType;
  @Field(() => Unit) defaultUnit!: Unit;
  @Field(() => DecimalScalar, { nullable: true }) gramsPerPiece!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) densityGPerMl!: string | null;
  @Field(() => [FoodAliasType]) aliases!: FoodAliasType[];
  @Field(() => NutritionProfileType, { nullable: true }) nutrition!: NutritionProfileType | null;
}

@ObjectType('FoodConnection')
export class FoodConnectionType {
  @Field(() => [FoodType]) nodes!: FoodType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}
