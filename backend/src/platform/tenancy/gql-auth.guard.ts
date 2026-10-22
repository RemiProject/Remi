import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IsSessionActiveQuery } from './is-session-active.query.js';
import { JwtTokensService } from './jwt-tokens.service.js';
import type { RequestContext } from './request-context.js';

/**
 * 1) Verify access JWT (signature + exp + typ).
 * 2) Require Session still active (revokedAt IS NULL) for payload.sid —
 *    so logout / logoutAll / password-reset kill access immediately.
 */
@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: JwtTokensService,
    private readonly queryBus: QueryBus,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context).getContext();
    const connectionAuthorization = gqlContext.connectionParams?.authorization ?? gqlContext.connectionParams?.Authorization;
    const req = gqlContext.req ?? gqlContext.extra?.request ?? gqlContext.request ?? { headers: {} };
    if (!gqlContext.req) gqlContext.req = req;
    const header: string | undefined = req.headers?.authorization ?? connectionAuthorization;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!raw) throw new UnauthorizedException('Missing bearer token');

    let userId: string;
    let sessionId: string;
    try {
      const payload = await this.tokens.verifyAccess(raw);
      userId = payload.sub;
      sessionId = payload.sid;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const active = await this.queryBus.execute(new IsSessionActiveQuery(sessionId, userId));
    if (!active) throw new UnauthorizedException('Session revoked or expired');

    req.ctx = { userId, sessionId } satisfies RequestContext;
    return true;
  }
}
