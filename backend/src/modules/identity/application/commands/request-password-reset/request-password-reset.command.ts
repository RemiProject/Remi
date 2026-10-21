import { Command } from '@nestjs/cqrs';

export class RequestPasswordResetCommand extends Command<{ accepted: true }> {
  constructor(public readonly email: string) { super(); }
}
