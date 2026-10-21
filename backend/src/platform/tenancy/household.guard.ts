import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GetActiveMembershipQuery } from './get-active-membership.query.js';
import type { RequestContext } from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run after GqlAuthGuard. householdId comes from the `x-household-id` header + an ACTIVE membership, never from the body. */
@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(private readonly queryBus: QueryBus) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = GqlExecutionContext.create(context).getContext().req;
    const ctx: RequestContext | undefined = req.ctx;
    const householdId: string | undefined = req.headers?.['x-household-id'];
    if (!ctx?.userId) throw new ForbiddenException('Authentication required');
    if (!householdId || !UUID.test(householdId)) throw new ForbiddenException('x-household-id header is required');

    const membership = await this.queryBus.execute(new GetActiveMembershipQuery(ctx.userId, householdId));
    if (!membership) throw new ForbiddenException('Not an active member of this household');
    req.ctx = { ...ctx, householdId, householdRole: membership.role } satisfies RequestContext;
    return true;
  }
}
