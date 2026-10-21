import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { ShoppingService } from '@/modules/shopping/application/shopping.service.js';
import {
  AddToShoppingListInputType, CreatePurchaseOrderInputType, CreateShoppingListInputType,
  PurchaseOrderConnectionType, PurchaseOrderStatusType, PurchaseOrderType, PurchaseReceiptType,
  ReceivePurchaseOrderItemInputType, ShoppingItemStatusType, ShoppingListItemType, ShoppingListType,
  TransitionPurchaseOrderInputType, UpdateShoppingItemInputType, UpdateShoppingListInputType,
} from './shopping.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class ShoppingResolver {
  constructor(private readonly shopping: ShoppingService) {}

  @Query(() => [ShoppingListType])
  shoppingLists(@Ctx() ctx: RequestContext) {
    return this.shopping.shoppingLists(ctx.householdId!);
  }

  @Query(() => PurchaseOrderConnectionType)
  purchaseOrders(
    @Ctx() ctx: RequestContext,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) {
    return this.shopping.purchaseOrders(ctx.householdId!, first, after);
  }

  @Mutation(() => ShoppingListType)
  createShoppingList(@Ctx() ctx: RequestContext, @Args('input') input: CreateShoppingListInputType) {
    return this.shopping.createList(ctx.householdId!, input);
  }

  @Mutation(() => ShoppingListType)
  updateShoppingList(@Ctx() ctx: RequestContext, @Args('input') input: UpdateShoppingListInputType) {
    return this.shopping.updateShoppingList(ctx.householdId!, input);
  }

  @Mutation(() => Boolean)
  deleteShoppingList(@Ctx() ctx: RequestContext, @Args('id', { type: () => ID }) id: string) {
    return this.shopping.deleteShoppingList(ctx.householdId!, id);
  }

  @Mutation(() => ShoppingListItemType)
  addToShoppingList(@Ctx() ctx: RequestContext, @Args('input') input: AddToShoppingListInputType) {
    return this.shopping.addToList(ctx.householdId!, input);
  }

  @Mutation(() => ShoppingListItemType)
  async updateShoppingListItem(@Ctx() ctx: RequestContext, @Args('input') input: UpdateShoppingItemInputType) {
    return this.shopping.updateShoppingItem(ctx.householdId!, input.id, input.status as ShoppingItemStatusType);
  }

  @Mutation(() => PurchaseOrderType)
  createPurchaseOrder(@Ctx() ctx: RequestContext, @Args('input') input: CreatePurchaseOrderInputType) {
    return this.shopping.createPurchaseOrder(ctx.householdId!, ctx.userId, input);
  }

  @Mutation(() => PurchaseOrderType)
  transitionPurchaseOrder(@Ctx() ctx: RequestContext, @Args('input') input: TransitionPurchaseOrderInputType) {
    return this.shopping.transitionPurchaseOrder(ctx.householdId!, input.id, input.status as PurchaseOrderStatusType);
  }

  @Mutation(() => PurchaseReceiptType)
  receivePurchaseOrderItem(@Ctx() ctx: RequestContext, @Args('input') input: ReceivePurchaseOrderItemInputType) {
    return this.shopping.receivePurchaseOrderItem(ctx.householdId!, ctx.userId, input.purchaseOrderItemId, input.quantity, input.unit, input.idempotencyKey);
  }
}
