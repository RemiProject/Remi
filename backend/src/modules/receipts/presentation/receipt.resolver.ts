import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { ReceiptService } from '@/modules/receipts/application/receipt.service.js';
import { ReceiptLineMatchType, ReceiveReceiptInput, ReceiveReceiptResultType } from './receipt.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class ReceiptResolver {
  constructor(private readonly receipts: ReceiptService) {}

  @Query(() => [ReceiptLineMatchType])
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  matchReceiptItems(@Ctx() ctx: RequestContext, @Args('names', { type: () => [String] }) names: string[]) {
    return this.receipts.match(ctx.householdId!, ctx.userId, names);
  }

  @Mutation(() => ReceiveReceiptResultType)
  receiveReceipt(@Ctx() ctx: RequestContext, @Args('input') input: ReceiveReceiptInput) {
    return this.receipts.receive(ctx.householdId!, ctx.userId, input);
  }
}
