import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Unit } from '@/shared/food-unit.js';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

export enum ShoppingListStatusType { ACTIVE = 'ACTIVE', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED' }
export enum ShoppingItemStatusType { NEEDED = 'NEEDED', PURCHASED = 'PURCHASED', SKIPPED = 'SKIPPED' }
export enum PurchaseOrderStatusType { DRAFT = 'DRAFT', PLACED = 'PLACED', CONFIRMED = 'CONFIRMED', DELIVERED = 'DELIVERED', CANCELLED = 'CANCELLED' }
registerEnumType(ShoppingListStatusType, { name: 'ShoppingListStatus' });
registerEnumType(ShoppingItemStatusType, { name: 'ShoppingItemStatus' });
registerEnumType(PurchaseOrderStatusType, { name: 'PurchaseOrderStatus' });

@InputType()
export class CreateShoppingListInputType {
  @Field() @IsString() @MaxLength(200) name!: string;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
}

@InputType()
export class UpdateShoppingListInputType {
  @Field(() => ID) @IsUUID() id!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) name?: string;
  @Field(() => ShoppingListStatusType, { nullable: true }) @IsOptional() @IsEnum(ShoppingListStatusType) status?: ShoppingListStatusType;
}

@InputType()
export class AddToShoppingListInputType {
  @Field(() => ID) @IsUUID() shoppingListId!: string;
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() productId?: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
}

@InputType()
export class UpdateShoppingItemInputType {
  @Field(() => ID) @IsUUID() id!: string;
  @Field(() => ShoppingItemStatusType) @IsEnum(ShoppingItemStatusType) status!: ShoppingItemStatusType;
}

@InputType()
export class PurchaseOrderLineInputType {
  @Field(() => ID) @IsUUID() foodId!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() productId?: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,4})?$/) unitPrice!: string;
}

@InputType()
export class CreatePurchaseOrderInputType {
  @Field() @IsString() @MaxLength(200) sourceName!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() productSourceId?: string;
  @Field(() => ID) @IsUUID() currencyId!: string;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
  @Field(() => [PurchaseOrderLineInputType]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineInputType) items!: PurchaseOrderLineInputType[];
}

@InputType()
export class TransitionPurchaseOrderInputType {
  @Field(() => ID) @IsUUID() id!: string;
  @Field(() => PurchaseOrderStatusType) @IsEnum(PurchaseOrderStatusType) status!: PurchaseOrderStatusType;
}

@InputType()
export class ReceivePurchaseOrderItemInputType {
  @Field(() => ID) @IsUUID() purchaseOrderItemId!: string;
  @Field(() => DecimalScalar) @IsString() @Matches(/^\d+(?:\.\d{1,3})?$/) quantity!: string;
  @Field(() => Unit) @IsEnum(Unit) unit!: Unit;
  @Field() @IsString() @MaxLength(200) idempotencyKey!: string;
}

@ObjectType()
export class ShoppingListItemType {
  @Field(() => ID) id!: string;
  @Field(() => ID) shoppingListId!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => ID, { nullable: true }) productId!: string | null;
  @Field(() => String, { nullable: true }) productName!: string | null;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => ShoppingItemStatusType) status!: ShoppingItemStatusType;
}

@ObjectType()
export class ShoppingListType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => ShoppingListStatusType) status!: ShoppingListStatusType;
  @Field(() => [ShoppingListItemType]) items!: ShoppingListItemType[];
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date) updatedAt!: Date;
}

@ObjectType()
export class CurrencyType {
  @Field(() => ID) id!: string;
  @Field() code!: string;
  @Field() name!: string;
  @Field() symbol!: string;
  @Field(() => Int) decimalPlaces!: number;
}

@ObjectType()
export class MoneyType {
  @Field(() => DecimalScalar) amount!: string;
  @Field(() => CurrencyType) currency!: CurrencyType;
}

@ObjectType()
export class PurchaseOrderItemType {
  @Field(() => ID) id!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => ID, { nullable: true }) productId!: string | null;
  @Field(() => String, { nullable: true }) productName!: string | null;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => DecimalScalar) receivedQuantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => MoneyType) unitPrice!: MoneyType;
  @Field(() => MoneyType) totalPrice!: MoneyType;
}

@ObjectType()
export class PurchaseOrderType {
  @Field(() => ID) id!: string;
  @Field() sourceName!: string;
  @Field(() => PurchaseOrderStatusType) status!: PurchaseOrderStatusType;
  @Field(() => MoneyType) totalCost!: MoneyType;
  @Field(() => CurrencyType) currency!: CurrencyType;
  @Field(() => [PurchaseOrderItemType]) items!: PurchaseOrderItemType[];
  @Field(() => Date, { nullable: true }) orderedAt!: Date | null;
  @Field(() => Date, { nullable: true }) confirmedAt!: Date | null;
  @Field(() => Date, { nullable: true }) deliveredAt!: Date | null;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class PurchaseOrderConnectionType {
  @Field(() => [PurchaseOrderType]) nodes!: PurchaseOrderType[];
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@ObjectType()
export class PurchaseReceiptType {
  @Field(() => ID) eventId!: string;
  @Field() replayed!: boolean;
  @Field(() => ID) purchaseOrderId!: string;
  @Field(() => PurchaseOrderStatusType) purchaseOrderStatus!: PurchaseOrderStatusType;
  @Field(() => ID) foodId!: string;
  @Field(() => DecimalScalar) quantity!: string;
  @Field(() => Unit) unit!: Unit;
  @Field(() => ID) inventoryItemId!: string;
}
