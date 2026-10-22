import { Command } from '@nestjs/cqrs';

export class RequestEmailVerificationCommand extends Command<{ accepted: true }> {
  constructor(public readonly userId: string) { super(); }
}
