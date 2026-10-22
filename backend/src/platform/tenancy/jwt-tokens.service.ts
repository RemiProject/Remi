import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '@/platform/config/app-config.service.js';

export interface JwtPayload {
  sub: string;
  /** Session row id — guard checks it is still not revoked. */
  sid: string;
  typ: 'access';
}

/**
 * Access tokens only. Refresh tokens are opaque and stored as hashes on Session.
 * Access JWT carries `sid` (session id) so GqlAuthGuard can reject tokens after logout
 * without waiting for JWT expiry.
 */
@Injectable()
export class JwtTokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccess(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId, typ: 'access' } satisfies JwtPayload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn: `${this.config.env.ACCESS_TOKEN_TTL_MIN}m`,
    });
  }

  get accessTtlSeconds(): number {
    return this.config.env.ACCESS_TOKEN_TTL_MIN * 60;
  }

  verifyAccess(token: string): Promise<JwtPayload> {
    return this.verify(token, this.config.env.JWT_ACCESS_SECRET);
  }

  private async verify(token: string, secret: string): Promise<JwtPayload> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret });
    if (payload.typ !== 'access' || !payload.sub || !payload.sid) throw new Error('wrong token type');
    return payload;
  }
}
