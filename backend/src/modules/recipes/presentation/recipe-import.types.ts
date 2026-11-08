import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar } from '@/platform/graphql/scalars.js';
import { ReceiptFoodOptionType, ReceiptMatchConfidence } from '@/modules/receipts/presentation/receipt.types.js';

@ObjectType()
export class ImportedIngredientType {
  @Field() text!: string;
  @Field(() => DecimalScalar, { nullable: true }) quantity!: string | null;
  @Field(() => Unit, { nullable: true }) unit!: Unit | null;
  @Field() name!: string;
  @Field() optional!: boolean;
  @Field(() => ReceiptMatchConfidence) confidence!: ReceiptMatchConfidence;
  @Field(() => ReceiptFoodOptionType, { nullable: true }) food!: ReceiptFoodOptionType | null;
  @Field(() => [ReceiptFoodOptionType]) alternatives!: ReceiptFoodOptionType[];
}

@ObjectType({ description: 'A recipe read from a web page, before it is saved.' })
export class RecipeImportPreviewType {
  @Field() sourceUrl!: string;
  @Field(() => String, { nullable: true }) sourceName!: string | null;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => Int, { nullable: true }) servings!: number | null;
  @Field(() => Int, { nullable: true }) prepTimeMin!: number | null;
  @Field(() => Int, { nullable: true }) cookTimeMin!: number | null;
  @Field(() => String, { nullable: true }) imageUrl!: string | null;
  @Field(() => String, { nullable: true }) author!: string | null;
  @Field(() => [ImportedIngredientType]) ingredients!: ImportedIngredientType[];
  @Field(() => [String]) steps!: string[];
  @Field(() => ID, { nullable: true, description: 'Set when this household already saved a recipe from the same link' }) savedRecipeId!: string | null;
}

@InputType()
export class ImportedIngredientInput {
  @Field() @IsString() @MaxLength(500) text!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() foodId?: string;
  @Field(() => DecimalScalar, { nullable: true }) @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity?: string;
  @Field(() => Unit, { nullable: true }) @IsOptional() @IsEnum(Unit) unit?: Unit;
  @Field({ defaultValue: false }) @IsOptional() @IsBoolean() optional?: boolean;
}

@InputType()
export class SaveImportedRecipeInput {
  @Field() @IsString() @MaxLength(2000) @Matches(/^https?:\/\//) sourceUrl!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) sourceName?: string;
  @Field() @IsString() @MaxLength(200) name!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(100) servings!: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1440) prepTimeMin?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1440) cookTimeMin?: number;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) @Matches(/^https?:\/\//) imageUrl?: string;
  @Field(() => [ImportedIngredientInput]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ImportedIngredientInput) ingredients!: ImportedIngredientInput[];
  @Field(() => [String]) @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(2000, { each: true }) steps!: string[];
}

@ObjectType()
export class RecipeIngredientLineType {
  @Field(() => Int) position!: number;
  @Field() text!: string;
  @Field(() => ID, { nullable: true, description: 'The catalogue food this line was matched to, if any' }) foodId!: string | null;
}
