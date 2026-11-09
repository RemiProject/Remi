import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar } from '@/platform/graphql/scalars.js';
import { RecipeIngredientLineType } from './recipe-import.types.js';

export enum RecipeDifficulty { EASY = 'EASY', MEDIUM = 'MEDIUM', HARD = 'HARD' }
registerEnumType(RecipeDifficulty, { name: 'RecipeDifficulty' });

@InputType()
export class RecipeIngredientInputType {
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field({ defaultValue: false }) @IsOptional() @IsBoolean() optional?: boolean;
}

@InputType()
export class RecipeStepInputType {
  @Field() @IsString() @MaxLength(5000) instruction!: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1440) durationMin?: number;
}

@InputType()
export class CreateRecipeInputType {
  @Field() @IsString() @MaxLength(200) name!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() cuisineId?: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(1000) servings!: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1440) prepTimeMin?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1440) cookTimeMin?: number;
  @Field(() => RecipeDifficulty, { defaultValue: RecipeDifficulty.MEDIUM }) @IsEnum(RecipeDifficulty) difficulty: RecipeDifficulty = RecipeDifficulty.MEDIUM;
  @Field(() => [RecipeIngredientInputType]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RecipeIngredientInputType) ingredients!: RecipeIngredientInputType[];
  @Field(() => [RecipeStepInputType]) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RecipeStepInputType) steps!: RecipeStepInputType[];
}

@ObjectType()
export class RecipeIngredientType {
  @Field(() => ID) id!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field() optional!: boolean;
}

@ObjectType()
export class RecipeStepType {
  @Field(() => ID) id!: string;
  @Field(() => Int) stepNumber!: number;
  @Field() instruction!: string;
  @Field(() => Int, { nullable: true }) durationMin!: number | null;
}

@ObjectType({ description: 'Estimated nutrition per serving, summed from raw ingredient values (USDA FoodData Central).' })
export class RecipeNutritionType {
  @Field(() => Int) calories!: number;
  @Field(() => Float) proteinG!: number;
  @Field(() => Float) carbsG!: number;
  @Field(() => Float) fatG!: number;
  @Field(() => Float) fiberG!: number;
  @Field(() => Float) sugarG!: number;
  @Field(() => Int) sodiumMg!: number;
  @Field(() => Int, { description: 'Required ingredients included in the totals' }) countedIngredients!: number;
  @Field(() => Int, { description: 'Required ingredients in the recipe' }) totalIngredients!: number;
  @Field(() => [String], { description: 'Nutrients (FIBER, SUGAR) that some counted ingredient does not report; their totals are lower bounds' }) incompleteNutrients!: string[];
}

@ObjectType()
export class RecipeSummaryType {
  @Field(() => ID) id!: string;
  @Field(() => ID, { nullable: true }) householdId!: string | null;
  @Field(() => ID, { nullable: true }) cuisineId!: string | null;
  @Field(() => String, { nullable: true }) cuisineName!: string | null;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => Int) servings!: number;
  @Field(() => Int, { nullable: true }) prepTimeMin!: number | null;
  @Field(() => Int, { nullable: true }) cookTimeMin!: number | null;
  @Field(() => RecipeDifficulty) difficulty!: RecipeDifficulty;
  @Field(() => RecipeNutritionType, { nullable: true, description: 'Null when no ingredient has nutrition data' }) nutrition!: RecipeNutritionType | null;
  @Field(() => String, { nullable: true, description: 'The page a saved recipe came from' }) sourceUrl!: string | null;
  @Field(() => String, { nullable: true }) sourceName!: string | null;
  @Field(() => String, { nullable: true }) imageUrl!: string | null;
}

@ObjectType()
export class RecipeType extends RecipeSummaryType {
  @Field(() => [RecipeIngredientType]) ingredients!: RecipeIngredientType[];
  @Field(() => [RecipeStepType]) steps!: RecipeStepType[];
  @Field(() => [RecipeIngredientLineType], { description: 'Ingredient lines as the source page printed them (saved recipes only)' }) ingredientLines!: RecipeIngredientLineType[];
}

@ObjectType()
export class RecipeConnectionType {
  @Field(() => [RecipeSummaryType]) nodes!: RecipeSummaryType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}
