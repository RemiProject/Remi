import { Field, ID, InputType, Int, ObjectType, createUnionType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar, LocalDateScalar } from '@/platform/graphql/scalars.js';
import { InsufficientStockType } from '@/modules/inventory/presentation/inventory.types.js';

export enum MealType { BREAKFAST = 'BREAKFAST', LUNCH = 'LUNCH', DINNER = 'DINNER', SNACK = 'SNACK', OTHER = 'OTHER' }
export enum MealOrigin { HOME = 'HOME', AWAY = 'AWAY', UNKNOWN = 'UNKNOWN' }
registerEnumType(MealType, { name: 'MealType' });
registerEnumType(MealOrigin, { name: 'MealOrigin' });

@InputType()
export class MealFoodInputType {
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) amount!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
}

@InputType({ isAbstract: true })
abstract class MealLogBaseInputType {
  @Field(() => MealType) @IsEnum(MealType) mealType!: MealType;
  @Field(() => Date) @IsDate() eatenAt!: Date;
  @Field(() => MealOrigin, { nullable: true, defaultValue: MealOrigin.HOME }) @IsOptional() @IsEnum(MealOrigin) origin?: MealOrigin;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(200) name?: string;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
  @Field(() => [MealFoodInputType]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => MealFoodInputType) items!: MealFoodInputType[];
}

@InputType()
export class LogMealInputType extends MealLogBaseInputType {}

@InputType()
export class MealMemberShareInputType {
  @Field(() => ID) @IsUUID() userId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) servings!: string;
}

@InputType()
export class LogFamilyMealInputType extends MealLogBaseInputType {
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) totalServings!: string;
  @Field(() => [MealMemberShareInputType]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => MealMemberShareInputType) shares!: MealMemberShareInputType[];
  @Field(() => DecimalScalar, { nullable: true }) @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) guestServings?: string;
}

@ObjectType()
export class MealItemType {
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => DecimalScalar) quantityG!: string;
  @Field(() => DecimalScalar, { nullable: true }) calories!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) proteinG!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) carbsG!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) fatG!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) fiberG!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) sugarG!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) sodiumMg!: string | null;
  @Field(() => Date) nutritionSnapshotAt!: Date;
}

@ObjectType()
export class MealTypeObject {
  @Field(() => ID) id!: string;
  @Field(() => ID) userId!: string;
  @Field(() => MealType) mealType!: MealType;
  @Field(() => Date) eatenAt!: Date;
  @Field(() => MealOrigin) origin!: MealOrigin;
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => [MealItemType]) items!: MealItemType[];
}

@ObjectType()
export class MealLogSuccessType {
  @Field() replayed!: boolean;
  @Field(() => [MealTypeObject]) meals!: MealTypeObject[];
}

@ObjectType()
export class SharesMismatchType {
  @Field(() => DecimalScalar) expectedServings!: string;
  @Field(() => DecimalScalar) actualServings!: string;
}

export const MealLogResult = createUnionType({
  name: 'MealLogResult',
  types: () => [MealLogSuccessType, SharesMismatchType, InsufficientStockType] as const,
  resolveType: (value: MealLogSuccessType | SharesMismatchType | object) => value instanceof SharesMismatchType ? SharesMismatchType : value instanceof MealLogSuccessType ? MealLogSuccessType : 'InsufficientStockType',
});

@ObjectType()
export class UserDailyNutritionType {
  @Field(() => LocalDateScalar) date!: string;
  @Field(() => DecimalScalar) calories!: string;
  @Field(() => DecimalScalar) proteinG!: string;
  @Field(() => DecimalScalar) carbsG!: string;
  @Field(() => DecimalScalar) fatG!: string;
  @Field(() => DecimalScalar) fiberG!: string;
  @Field(() => DecimalScalar) sugarG!: string;
  @Field(() => DecimalScalar) sodiumMg!: string;
  @Field(() => Int) mealCount!: number;
  @Field() isFinal!: boolean;
  @Field(() => Date) computedAt!: Date;
}

@InputType()
export class CreateMealPlanInputType {
  @Field() @IsString() @MaxLength(200) name!: string;
  @Field(() => LocalDateScalar) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @Field(() => LocalDateScalar) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
}

@InputType()
export class PlanMealInputType {
  @Field(() => ID) @IsUUID() mealPlanId!: string;
  @Field(() => ID) @IsUUID() recipeId!: string;
  @Field(() => LocalDateScalar) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) mealDate!: string;
  @Field(() => MealType) @IsEnum(MealType) mealType!: MealType;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,2})?$/) servings!: string;
}

@ObjectType()
export class PlannedMealType {
  @Field(() => ID) id!: string;
  @Field(() => ID) recipeId!: string;
  @Field() recipeName!: string;
  @Field(() => LocalDateScalar) mealDate!: string;
  @Field(() => MealType) mealType!: MealType;
  @Field(() => DecimalScalar) servings!: string;
}

@ObjectType()
export class MealPlanTypeObject {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => LocalDateScalar) startDate!: string;
  @Field(() => LocalDateScalar) endDate!: string;
  @Field(() => [PlannedMealType]) meals!: PlannedMealType[];
}
