import { Field, ID, InputType, Int, ObjectType, createUnionType, registerEnumType } from '@nestjs/graphql';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength, Matches } from 'class-validator';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar, LocalDateScalar } from '@/platform/graphql/scalars.js';
import { StorageLocation } from '@/modules/inventory/storage-location.js';

registerEnumType(StorageLocation, { name: 'StorageLocation' });

@InputType()
export class InventoryStockInput {
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) amount!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
  @Field(() => StorageLocation, { nullable: true }) @IsOptional() @IsEnum(StorageLocation) storageLocation?: StorageLocation;
  @Field(() => LocalDateScalar, { nullable: true }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) purchaseDate?: string;
  @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() estimatedExpiryAt?: Date;
}

@ObjectType()
export class InventoryMovementType {
  @Field(() => ID) inventoryItemId!: string;
  @Field(() => DecimalScalar) quantityDelta!: string;
  @Field(() => DecimalScalar) balanceAfter!: string;
}

@ObjectType()
export class InventoryMutationSuccessType {
  @Field(() => ID) eventId!: string;
  @Field() replayed!: boolean;
  @Field(() => ID) foodId!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => [InventoryMovementType]) balances!: InventoryMovementType[];
}

@ObjectType()
export class InsufficientStockType {
  @Field(() => DecimalScalar) available!: string;
  @Field(() => Unit) unit!: Unit;
}

export const InventoryMutationResult = createUnionType({
  name: 'InventoryMutationResult',
  types: () => [InventoryMutationSuccessType, InsufficientStockType] as const,
  resolveType: (value: InventoryMutationSuccessType | InsufficientStockType) => value instanceof InsufficientStockType ? InsufficientStockType : InventoryMutationSuccessType,
});

@ObjectType()
export class InventoryItemType {
  @Field(() => ID) id!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => StorageLocation) storageLocation!: StorageLocation;
  @Field(() => Date, { nullable: true }) estimatedExpiryAt!: Date | null;
  @Field(() => Int) version!: number;
}

@ObjectType()
export class InventoryConnectionType {
  @Field(() => [InventoryItemType]) nodes!: InventoryItemType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@InputType()
export class InventoryAdjustmentInput {
  @Field(() => ID) @IsUUID() inventoryItemId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^-?\d+(?:\.\d{1,3})?$/) delta!: string;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
}

@ObjectType()
export class InventoryTransactionType {
  @Field(() => ID) id!: string;
  @Field(() => ID) eventId!: string;
  @Field() movementType!: string;
  @Field(() => DecimalScalar) quantityDelta!: string;
  @Field(() => DecimalScalar) balanceAfter!: string;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class InventoryTransactionConnectionType {
  @Field(() => [InventoryTransactionType]) nodes!: InventoryTransactionType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@ObjectType()
export class InventoryItemDetailType extends InventoryItemType {
  @Field(() => InventoryTransactionConnectionType) transactions!: InventoryTransactionConnectionType;
}
