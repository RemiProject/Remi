import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

export enum PredictionTypeEnum {
  FOOD_DEPLETION = 'FOOD_DEPLETION', WASTE = 'WASTE', CONSUMPTION = 'CONSUMPTION', SUPPLY_NEED = 'SUPPLY_NEED',
  STOCK_BALANCE = 'STOCK_BALANCE', COST = 'COST', NUTRITION_SIGNAL = 'NUTRITION_SIGNAL', MEAL_DEMAND = 'MEAL_DEMAND',
  MEAL_PLAN_ADHERENCE = 'MEAL_PLAN_ADHERENCE', PREFERENCE_TREND = 'PREFERENCE_TREND', RECIPE_USAGE = 'RECIPE_USAGE',
}
registerEnumType(PredictionTypeEnum, { name: 'PredictionType' });

@ObjectType()
export class FoodDepletionPredictionType {
  @Field(() => ID) id!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => DecimalScalar) currentQty!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => DecimalScalar) avgDailyQty!: string;
  @Field(() => DecimalScalar) daysLeft!: string;
  @Field(() => Date) runOutAt!: Date;
  @Field(() => DecimalScalar) confidence!: string;
  @Field() modelVersion!: string;
  @Field() generatedAt!: Date;
  @Field() expiresAt!: Date;
}

@ObjectType()
export class PredictionConnectionType {
  @Field(() => [FoodDepletionPredictionType]) nodes!: FoodDepletionPredictionType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}
