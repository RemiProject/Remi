import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { EmailVerifiedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { InvalidTokenError } from '@/modules/identity/domain/services/identity.errors.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { VerifyEmailCommand } from './verify-email.command.js';

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
  ) {}

  async execute({ token }: VerifyEmailCommand): Promise<{ verified: true }> {
    const userId = await this.tx.run(async (tx) => {
      const consumed = await this.tokens.consumeByHash(tx, hashToken(token), 'EMAIL_VERIFY');
      if (!consumed?.userId) throw new InvalidTokenError();
      await this.users.markEmailVerified(tx, consumed.userId);
      return consumed.userId;
    });
    this.eventBus.publish(new EmailVerifiedEvent(userId));
    return { verified: true };
  }
}
