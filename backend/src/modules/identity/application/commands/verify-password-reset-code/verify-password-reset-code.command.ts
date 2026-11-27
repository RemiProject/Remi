import { Command } from '@nestjs/cqrs';

export class VerifyPasswordResetCodeCommand extends Command<{ resetToken: string; expiresAt: Date }> {
  constructor(public readonly email: string, public readonly code: string) { super(); }
}
