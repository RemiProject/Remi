import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { HouseholdGuard } from '@/platform/tenancy/household.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { SearchService } from './search.service.js';
import { SearchDocumentSourceType, SearchResultType } from './search.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, HouseholdGuard)
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  @Query(() => [SearchResultType])
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  search(
    @Ctx() ctx: RequestContext,
    @Args('query', { type: () => String }) query: string,
    @Args('types', { type: () => [SearchDocumentSourceType], nullable: true }) types: SearchDocumentSourceType[] | undefined,
    @Args('first', { type: () => Int, defaultValue: 10 }) first: number,
  ) {
    return this.searchService.search(query, ctx.householdId!, types, first);
  }
}
