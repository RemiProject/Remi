import { Module, UseGuards } from '@nestjs/common';
import { Args, Field, ID, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { DomainError } from '@/shared/domain-error.js';
import { MediaModule } from '@/modules/media/media.module.js';
import { ImageService } from '@/modules/media/application/image.service.js';
import { ImageObjectType } from '@/modules/media/presentation/image.types.js';
import { assertLeftoverDates } from './leftovers-policy.js';

@ObjectType()
class CookbookLeftover {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => Int) portions!: number;
  @Field() cookedOn!: string;
  @Field(() => String, { nullable: true }) useBy!: string | null;
  @Field() storage!: string;
  @Field() status!: string;
  @Field() notes!: string;
}
@InputType()
class SaveCookbookLeftoverInput {
  @Field(() => ID) @IsUUID() id!: string;
  @Field() @IsString() @MaxLength(100) name!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(100) portions!: number;
  @Field() @IsString() @MaxLength(10) cookedOn!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(10) useBy?: string;
  @Field() @IsIn(['FRIDGE', 'FREEZER']) storage!: string;
  @Field() @IsString() @MaxLength(1000) notes!: string;
}
@ObjectType()
class CookbookFeedback {
  @Field(() => ID) id!: string;
  @Field() subject!: string;
  @Field() message!: string;
  @Field() createdAt!: Date;
}
@InputType()
class SubmitCookbookFeedbackInput {
  @Field(() => ID) @IsUUID() id!: string;
  @Field() @IsString() @MaxLength(120) subject!: string;
  @Field() @IsString() @MaxLength(5000) message!: string;
}
@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
class LeftoversResolver {
  constructor(private readonly transactions: TransactionRunner, private readonly images: ImageService) {}
  @Query(() => [CookbookFeedback])
  myCookbookFeedback(@Ctx() ctx: RequestContext) {
    return this.transactions.run(tx => tx.$queryRaw<CookbookFeedback[]>`SELECT "id", "subject", "message", "createdAt" FROM "CookbookFeedback" WHERE "userId" = ${ctx.userId}::uuid AND "householdId" = ${ctx.householdId}::uuid ORDER BY "createdAt" DESC LIMIT 20`, ctx);
  }
  @Mutation(() => CookbookFeedback)
  submitCookbookFeedback(@Ctx() ctx: RequestContext, @Args('input') input: SubmitCookbookFeedbackInput) {
    if (!input.subject.trim() || !input.message.trim()) throw new DomainError('BAD_REQUEST', 'Enter a subject and message.');
    return this.transactions.run(async tx => {
      await tx.$executeRaw`INSERT INTO "CookbookFeedback" ("id", "householdId", "userId", "subject", "message") VALUES (${input.id}::uuid, ${ctx.householdId}::uuid, ${ctx.userId}::uuid, ${input.subject.trim()}, ${input.message.trim()}) ON CONFLICT ("id") DO NOTHING`;
      const rows = await tx.$queryRaw<CookbookFeedback[]>`SELECT "id", "subject", "message", "createdAt" FROM "CookbookFeedback" WHERE "id" = ${input.id}::uuid AND "userId" = ${ctx.userId}::uuid AND "householdId" = ${ctx.householdId}::uuid`;
      if (!rows[0]) throw new DomainError('NOT_FOUND', 'Feedback not found.', 404);
      if (rows[0].subject !== input.subject.trim() || rows[0].message !== input.message.trim()) throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This feedback save key was already used.');
      return rows[0];
    }, ctx);
  }
  @Query(() => [ImageObjectType])
  async cookbookImages(@Ctx() ctx: RequestContext) {
    const rows = await this.transactions.run(tx => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Image" WHERE "householdId" = ${ctx.householdId}::uuid ORDER BY "createdAt" DESC LIMIT 50`, ctx);
    return Promise.all(rows.map(row => this.images.get(ctx.householdId!, row.id)));
  }
  @Query(() => [CookbookLeftover])
  cookbookLeftovers(@Ctx() ctx: RequestContext) {
    return this.transactions.run(tx => tx.$queryRaw<CookbookLeftover[]>`
      SELECT "id", "name", "portions", "cookedOn"::text, "useBy"::text, "storage", "status", "notes"
      FROM "CookbookLeftover" WHERE "householdId" = ${ctx.householdId}::uuid ORDER BY "cookedOn" DESC, "id" DESC LIMIT 500`, ctx);
  }
  @Mutation(() => CookbookLeftover)
  async saveCookbookLeftover(@Ctx() ctx: RequestContext, @Args('input') input: SaveCookbookLeftoverInput) {
    assertLeftoverDates(input.cookedOn, input.useBy);
    const name = input.name.trim();
    if (!name) throw new DomainError('BAD_REQUEST', 'Enter a name for the leftovers.');
    return this.transactions.run(async tx => {
      await tx.$executeRaw`INSERT INTO "CookbookLeftover" ("id", "householdId", "createdByUserId", "name", "portions", "cookedOn", "useBy", "storage", "notes")
        VALUES (${input.id}::uuid, ${ctx.householdId}::uuid, ${ctx.userId}::uuid, ${name}, ${input.portions}, ${input.cookedOn}::date, ${input.useBy || null}::date, ${input.storage}, ${input.notes.trim()})
        ON CONFLICT ("id") DO NOTHING`;
      const rows = await tx.$queryRaw<CookbookLeftover[]>`SELECT "id", "name", "portions", "cookedOn"::text, "useBy"::text, "storage", "status", "notes" FROM "CookbookLeftover" WHERE "id" = ${input.id}::uuid AND "householdId" = ${ctx.householdId}::uuid`;
      if (!rows[0]) throw new DomainError('NOT_FOUND', 'Leftover not found.', 404);
      const saved = rows[0];
      if (saved.name !== name || saved.portions !== input.portions || saved.cookedOn !== input.cookedOn || saved.useBy !== (input.useBy || null) || saved.storage !== input.storage || saved.notes !== input.notes.trim()) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This save key was already used for another leftover.');
      }
      return saved;
    }, ctx);
  }
  @Mutation(() => CookbookLeftover)
  async setCookbookLeftoverStatus(@Ctx() ctx: RequestContext, @Args('id', { type: () => ID }) id: string, @Args('status') status: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !['STORED', 'EATEN', 'DISCARDED'].includes(status)) throw new DomainError('BAD_REQUEST', 'Invalid leftover update.');
    return this.transactions.run(async tx => {
      const rows = await tx.$queryRaw<CookbookLeftover[]>`UPDATE "CookbookLeftover" SET "status" = ${status}, "updatedAt" = now() WHERE "id" = ${id}::uuid AND "householdId" = ${ctx.householdId}::uuid RETURNING "id", "name", "portions", "cookedOn"::text, "useBy"::text, "storage", "status", "notes"`;
      if (!rows[0]) throw new DomainError('NOT_FOUND', 'Leftover not found.', 404);
      return rows[0];
    }, ctx);
  }
}
@Module({ imports: [MediaModule], providers: [LeftoversResolver] })
export class LeftoversModule {}
