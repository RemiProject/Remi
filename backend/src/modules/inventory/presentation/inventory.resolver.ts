import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { InsufficientStockError, InventoryLedgerService } from '@/modules/inventory/application/inventory-ledger.service.js';
import {
  InsufficientStockType,
  InventoryConnectionType,
  InventoryAdjustmentInput,
  InventoryItemDetailType,
  InventoryMutationResult,
  InventoryMutationSuccessType,
  InventoryStockInput,
} from '@/modules/inventory/presentation/inventory.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class InventoryResolver {
  constructor(private readonly ledger: InventoryLedgerService) {}

  @Query(() => InventoryConnectionType)
  inventory(
    @Ctx() ctx: RequestContext,
    @Args('first', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ) {
    return this.ledger.list(ctx.householdId!, first, after);
  }

  @Query(() => InventoryItemDetailType)
  inventoryItem(
    @Ctx() ctx: RequestContext,
    @Args('id', { type: () => ID }) id: string,
    @Args('transactionFirst', { type: () => Int, defaultValue: 20 }) first: number,
    @Args('transactionAfter', { type: () => String, nullable: true }) after?: string,
  ) {
    return this.ledger.item(ctx.householdId!, id, first, after);
  }

  @Mutation(() => InventoryMutationResult)
  async addStock(@Ctx() ctx: RequestContext, @Args('input') input: InventoryStockInput) {
    const value = await this.ledger.addStock(ctx.householdId!, ctx.userId, input);
    return Object.assign(new InventoryMutationSuccessType(), value);
  }

  @Mutation(() => InventoryMutationResult)
  async consumeStock(@Ctx() ctx: RequestContext, @Args('input') input: InventoryStockInput) {
    try {
      const value = await this.ledger.consumeStock(ctx.householdId!, ctx.userId, input);
      return Object.assign(new InventoryMutationSuccessType(), value);
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        return Object.assign(new InsufficientStockType(), error.details);
      }
      throw error;
    }
  }

  @Mutation(() => InventoryMutationResult)
  async discardStock(@Ctx() ctx: RequestContext, @Args('input') input: InventoryStockInput) {
    try {
      const value = await this.ledger.discardStock(ctx.householdId!, ctx.userId, input);
      return Object.assign(new InventoryMutationSuccessType(), value);
    } catch (error) {
      if (error instanceof InsufficientStockError) return Object.assign(new InsufficientStockType(), error.details);
      throw error;
    }
  }

  @Mutation(() => InventoryMutationResult)
  async adjustStock(@Ctx() ctx: RequestContext, @Args('input') input: InventoryAdjustmentInput) {
    try {
      const value = await this.ledger.adjustStock(ctx.householdId!, ctx.userId, input);
      return Object.assign(new InventoryMutationSuccessType(), value);
    } catch (error) {
      if (error instanceof InsufficientStockError) return Object.assign(new InsufficientStockType(), error.details);
      throw error;
    }
  }
}
