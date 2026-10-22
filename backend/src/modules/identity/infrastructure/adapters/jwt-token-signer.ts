import { Injectable } from '@nestjs/common';
import { generateRawToken, hashToken } from '@/modules/identity/domain/services/token-hash.js';
import type { TokenSignerPort } from '@/modules/identity/domain/ports/token-signer.port.js';
import { JwtTokensService } from '@/platform/tenancy/jwt-tokens.service.js';

@Injectable()
export class JwtTokenSigner implements TokenSignerPort {
  constructor(private readonly jwt: JwtTokensService) {}

  async issueAccess(userId: string, sessionId: string) {
    return {
      accessToken: await this.jwt.signAccess(userId, sessionId),
      expiresInSeconds: this.jwt.accessTtlSeconds,
    };
  }

  createRefreshToken(): { raw: string; hash: string } {
    const raw = generateRawToken();
    return { raw, hash: hashToken(raw) };
  }

  async verifyAccess(token: string) {
    const payload = await this.jwt.verifyAccess(token);
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
