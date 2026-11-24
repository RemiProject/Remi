import { Command } from '@nestjs/cqrs';

export class VerifyEmailCodeCommand extends Command<{ verified: true }> {
  constructor(public readonly email: string, public readonly code: string) { super(); }
}
