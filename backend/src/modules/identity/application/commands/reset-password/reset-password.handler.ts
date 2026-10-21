import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { PasswordChangedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { PASSWORD_HASHER, type PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { InvalidTokenError, UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { ResetPasswordCommand } from './reset-password.command.js';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<ResetPasswordCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly eventBus: EventBus,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute({ token, newPassword }: ResetPasswordCommand): Promise<{ changed: true }> {
    const passwordHash = await this.hasher.hash(newPassword);
    const changedAt = new Date();
    const from = this.config.env.MAIL_FROM;
    const supportEmail = (from && /<(.+)>/.exec(from)?.[1]) || from || 'support@ai-kitchen.local';

    const userId = await this.tx.run(async (tx) => {
      const consumed = await this.tokens.consumeByHash(tx, hashToken(token), 'PASSWORD_RESET');
      if (!consumed?.userId) throw new InvalidTokenError();
      const user = await this.users.findById(tx, consumed.userId);
      if (!user) throw new UserNotFoundError();
      await this.users.updatePassword(tx, user.id, passwordHash);
      // Password change invalidates every refresh session.
      await this.sessions.revokeAllForUser(tx, user.id);
      await this.outbox.publish(tx, {
        topic: OutboxTopics.PasswordChanged,
        dedupeKey: `${user.id}:${changedAt.toISOString()}`,
        payload: { to: user.email, name: user.name, lang: user.languageCode, changedAt: changedAt.toISOString(), supportEmail },
      });
      return user.id;
    });
    this.eventBus.publish(new PasswordChangedEvent(userId));
    return { changed: true };
  }
}
