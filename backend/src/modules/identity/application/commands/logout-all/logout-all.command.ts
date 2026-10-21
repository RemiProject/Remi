import { Command } from '@nestjs/cqrs';

/** Logout every device for the authenticated user. */
export class LogoutAllCommand extends Command<void> {
  constructor(public readonly userId: string) {
    super();
  }
}
