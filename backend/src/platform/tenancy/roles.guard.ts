import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { HouseholdRoleName, RequestContext } from './request-context.js';

const ROLES_KEY = 'household:roles';
export const HouseholdRoles = (...roles: HouseholdRoleName[]) => SetMetadata(ROLES_KEY, roles);

/** Use after HouseholdGuard: `@UseGuards(GqlAuthGuard, HouseholdGuard, RolesGuard) @HouseholdRoles('OWNER')`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<HouseholdRoleName[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const ctx: RequestContext | undefined = GqlExecutionContext.create(context).getContext().req.ctx;
    if (!ctx?.householdRole || !roles.includes(ctx.householdRole)) throw new ForbiddenException('Insufficient household role');
    return true;
  }
}
