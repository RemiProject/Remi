import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { ImageService } from '@/modules/media/application/image.service.js';
import { ConfirmImageUploadInput, ImageObjectType, ImageUploadTicketType, RequestImageUploadInput } from '@/modules/media/presentation/image.types.js';
import { UPLOAD_THROTTLE } from '@/platform/graphql/throttle.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class ImageResolver {
  constructor(private readonly service: ImageService) {}

  @Throttle(UPLOAD_THROTTLE)
  @Mutation(() => ImageUploadTicketType, { description: 'Step 1 of 2: get a presigned PUT URL, upload the bytes, then call confirmImageUpload.' })
  requestImageUpload(@Ctx() ctx: RequestContext, @Args('input') input: RequestImageUploadInput) {
    return this.service.requestUpload(ctx.householdId!, input.mimeType, input.sizeBytes);
  }

  @Throttle(UPLOAD_THROTTLE)
  @Mutation(() => ImageObjectType, { description: 'Step 2 of 2: validates the uploaded bytes and records the image. Idempotent per storageKey.' })
  confirmImageUpload(@Ctx() ctx: RequestContext, @Args('input') input: ConfirmImageUploadInput) {
    return this.service.confirmUpload(ctx.householdId!, ctx.userId, input.storageKey, input.type);
  }

  @Query(() => ImageObjectType)
  image(@Ctx() ctx: RequestContext, @Args('id', { type: () => ID }) id: string) {
    return this.service.get(ctx.householdId!, id);
  }
}
