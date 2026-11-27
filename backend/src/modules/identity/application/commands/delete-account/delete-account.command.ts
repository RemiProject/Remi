import { Command } from '@nestjs/cqrs';

/** Delete the signed-in user's account after confirming their password. */
export class DeleteAccountCommand extends Command<void> {
  constructor(public readonly userId: string, public readonly password: string) {
    super();
  }
}
