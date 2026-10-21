import { Command } from '@nestjs/cqrs';

export class ResetPasswordCommand extends Command<{ changed: true }> {
  constructor(public readonly token: string, public readonly newPassword: string) { super(); }
}
