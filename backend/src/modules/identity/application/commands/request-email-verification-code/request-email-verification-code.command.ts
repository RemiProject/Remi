import { Command } from '@nestjs/cqrs';

export class RequestEmailVerificationCodeCommand extends Command<{ accepted: true }> {
  constructor(public readonly email: string) { super(); }
}
