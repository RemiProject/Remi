import { UseGuards } from '@nestjs/common';
import { Args, Field, ID, ObjectType, Query, Resolver, registerEnumType } from '@nestjs/graphql';
import { ProductSafetyService } from '@/modules/safety/application/product-safety.service.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';

export enum ProductSafetyStatusEnum { SAFE = 'SAFE', WARNING = 'WARNING', UNSAFE = 'UNSAFE' }
registerEnumType(ProductSafetyStatusEnum, { name: 'ProductSafetyStatus' });

@ObjectType()
export class ProductSafetyCheckType {
  @Field(() => ID) productId!: string;
  @Field() productName!: string;
  @Field(() => String, { nullable: true }) brand!: string | null;
  @Field() barcode!: string;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => ProductSafetyStatusEnum, { description: 'UNSAFE = at least one filter failed (allergy, avoid rule, diet). Show a hard warning.' })
  status!: ProductSafetyStatusEnum;
  @Field(() => [String], { description: 'SafetyFilterType values that failed' }) failedFilters!: string[];
  @Field(() => [String], { description: 'SafetyFilterType values that only warn (dislikes, limits, "may contain" traces)' }) warnedFilters!: string[];
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class ProductSafetyResolver {
  constructor(private readonly service: ProductSafetyService) {}

  @Query(() => ProductSafetyCheckType, { nullable: true, description: "Checks a scanned barcode against the caller's own safety profile. Null when the barcode is unknown." })
  productSafetyCheck(@Ctx() ctx: RequestContext, @Args('barcode') barcode: string) {
    return this.service.checkBarcode(ctx.userId, barcode.trim().slice(0, 64));
  }
}
