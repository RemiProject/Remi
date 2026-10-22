import { Command } from '@nestjs/cqrs';

export class VerifyEmailCommand extends Command<{ verified: true }> {
  constructor(public readonly token: string) { super(); }
}
