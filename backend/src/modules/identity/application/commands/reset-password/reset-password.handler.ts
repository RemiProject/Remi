import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { EmailVerifiedEvent, PasswordChangedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { PASSWORD_HASHER, type PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { InvalidTokenError, UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { ResetPasswordCommand } from './reset-password.command.js';
import { assertStrongPassword } from '@/modules/identity/domain/services/registration-policy.js';

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
    private readonly resetCodes: PasswordResetCodeService,
    private readonly verificationCodes: EmailVerificationCodeService,
  ) {}

  /** Accepts a reset link token or a token from verifyPasswordResetCode: both are single-use PASSWORD_RESET tokens. */
  async execute({ token, newPassword }: ResetPasswordCommand): Promise<{ changed: true }> {
    assertStrongPassword(newPassword);
    const passwordHash = await this.hasher.hash(newPassword);
    const changedAt = new Date();
    const from = this.config.env.MAIL_FROM;
    const supportEmail = (from && /<(.+)>/.exec(from)?.[1]) || from || 'support@ai-kitchen.local';

    const { userId, newlyVerified } = await this.tx.run(async (tx) => {
      const consumed = await this.tokens.consumeByHash(tx, hashToken(token), 'PASSWORD_RESET');
      if (!consumed?.userId) throw new InvalidTokenError();
      const user = await this.users.findById(tx, consumed.userId);
      if (!user) throw new UserNotFoundError();
      await this.users.updatePassword(tx, user.id, passwordHash);
      // Password change invalidates every refresh session.
      await this.sessions.revokeAllForUser(tx, user.id);
      // No other reset link, reset token or reset code of this account works afterwards.
      await this.tokens.invalidateOpenForUser(tx, user.id, 'PASSWORD_RESET');
      await this.resetCodes.invalidateAllWithinTransaction(tx, user.id);
      // Receiving the reset email proved the person owns the inbox.
      await this.verificationCodes.invalidateWithinTransaction(tx, user.id);
      if (!user.emailVerifiedAt) await this.users.markEmailVerified(tx, user.id);
      await this.outbox.publish(tx, {
        topic: OutboxTopics.PasswordChanged,
        dedupeKey: `${user.id}:${changedAt.toISOString()}`,
        payload: { to: user.email, name: user.name, lang: user.languageCode, changedAt: changedAt.toISOString(), supportEmail },
      });
      return { userId: user.id, newlyVerified: !user.emailVerifiedAt };
    });
    this.eventBus.publish(new PasswordChangedEvent(userId));
    if (newlyVerified) this.eventBus.publish(new EmailVerifiedEvent(userId));
    return { changed: true };
  }
}
