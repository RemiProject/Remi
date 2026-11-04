import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { FoodAliasType } from '@/modules/catalog/catalog.public.js';
import { DecimalScalar, LocalDateScalar } from '@/platform/graphql/scalars.js';
import { Unit } from '@/shared/food-unit.js';
import { RecipeSummaryType } from '@/modules/recipes/presentation/recipe.types.js';

export enum RecipeIngredientMatchStatus { ENOUGH = 'ENOUGH', SHORT = 'SHORT', MISSING = 'MISSING', EXPIRED = 'EXPIRED', UNKNOWN = 'UNKNOWN', ASSUMED = 'ASSUMED' }
registerEnumType(RecipeIngredientMatchStatus, { name: 'RecipeIngredientMatchStatus' });

@ObjectType({ isAbstract: true })
class SuggestionFoodType {
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => [FoodAliasType]) aliases!: FoodAliasType[];
}

@ObjectType()
export class RecipeSuggestionIngredientType extends SuggestionFoodType {
  @Field(() => RecipeIngredientMatchStatus) status!: RecipeIngredientMatchStatus;
  @Field(() => DecimalScalar) requiredAmount!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => DecimalScalar, { nullable: true }) availableAmount!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) missingAmount!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) knownAvailableAmount!: string | null;
}

@ObjectType()
export class RecipeSuggestionExpiringFoodType extends SuggestionFoodType {
  @Field(() => LocalDateScalar) expiryDay!: string;
}

@ObjectType()
export class RecipeSuggestionType {
  @Field(() => RecipeSummaryType) recipe!: RecipeSummaryType;
  @Field(() => Float) coverageRatio!: number;
  @Field(() => Int) haveCount!: number;
  @Field(() => Int) requiredCount!: number;
  @Field(() => [RecipeSuggestionIngredientType]) expired!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionIngredientType]) missing!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionIngredientType]) short!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionIngredientType]) unknown!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionIngredientType]) assumedStaples!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionIngredientType]) optional!: RecipeSuggestionIngredientType[];
  @Field(() => [RecipeSuggestionExpiringFoodType]) expiringSoon!: RecipeSuggestionExpiringFoodType[];
  @Field(() => [String]) safetyWarnings!: string[];
}

@ObjectType()
export class RecipeSuggestionsConnectionType {
  @Field(() => [RecipeSuggestionType]) nodes!: RecipeSuggestionType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
  @Field(() => Int) totalCount!: number;
  @Field(() => [String]) missingStapleNames!: string[];
}
