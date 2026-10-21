import { Command } from '@nestjs/cqrs';

/** Logout the current device (revoke the session that matches the given refresh token). */
export class LogoutCommand extends Command<void> {
  constructor(
    public readonly userId: string,
    public readonly refreshToken: string,
  ) {
    super();
  }
}
