import { Command } from '@nestjs/cqrs';
import type { AuthTokens } from '@/modules/identity/domain/ports/token-signer.port.js';

export class LoginCommand extends Command<AuthTokens> {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly userAgent?: string | null,
  ) {
    super();
  }
}
