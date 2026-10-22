import { Command } from '@nestjs/cqrs';
import type { AuthTokens } from '@/modules/identity/domain/ports/token-signer.port.js';

/** Rotates the refresh token and returns a fresh access + refresh pair. */
export class RefreshAccessTokenCommand extends Command<AuthTokens> {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
