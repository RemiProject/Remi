import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDate, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar, LocalDateScalar } from '@/platform/graphql/scalars.js';
import { StorageLocation } from '@/modules/inventory/storage-location.js';

export enum ReceiptMatchConfidence { HIGH = 'HIGH', MEDIUM = 'MEDIUM', NONE = 'NONE' }
registerEnumType(ReceiptMatchConfidence, { name: 'ReceiptMatchConfidence' });

@ObjectType()
export class ReceiptFoodOptionType {
  @Field(() => ID) foodId!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) arabicName!: string | null;
  @Field() categoryCode!: string;
  @Field() categoryName!: string;
  @Field(() => Unit) defaultUnit!: Unit;
  @Field(() => DecimalScalar, { nullable: true }) gramsPerPiece!: string | null;
  @Field(() => StorageLocation) storageLocation!: StorageLocation;
  @Field(() => Float) score!: number;
}

@ObjectType()
export class ReceiptStockType {
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
}

@ObjectType()
export class ReceiptLineMatchType {
  @Field() query!: string;
  @Field(() => ReceiptMatchConfidence) confidence!: ReceiptMatchConfidence;
  @Field(() => ReceiptFoodOptionType, { nullable: true }) food!: ReceiptFoodOptionType | null;
  @Field(() => [ReceiptFoodOptionType]) alternatives!: ReceiptFoodOptionType[];
  /** What the kitchen already holds of the matched food, per unit. */
  @Field(() => [ReceiptStockType]) inKitchen!: ReceiptStockType[];
}

@InputType()
export class ReceiptItemInput {
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) amount!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field(() => StorageLocation) @IsEnum(StorageLocation) storageLocation!: StorageLocation;
  @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() estimatedExpiryAt?: Date;
}

@InputType()
export class ReceiveReceiptInput {
  @Field() @IsString() @MaxLength(160) idempotencyKey!: string;
  @Field(() => LocalDateScalar, { nullable: true }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) purchaseDate?: string;
  @Field(() => [ReceiptItemInput]) @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ReceiptItemInput) items!: ReceiptItemInput[];
}

@ObjectType()
export class ReceivedReceiptItemType {
  @Field(() => ID) foodId!: string;
  @Field(() => ID) inventoryItemId!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
}

@ObjectType()
export class ReceiveReceiptResultType {
  @Field(() => Int) added!: number;
  /** True when this receipt was already added with the same key; nothing was added twice. */
  @Field() replayed!: boolean;
  @Field(() => [ReceivedReceiptItemType]) items!: ReceivedReceiptItemType[];
}
