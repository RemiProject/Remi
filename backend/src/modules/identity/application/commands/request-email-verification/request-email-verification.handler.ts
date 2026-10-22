import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { RequestEmailVerificationCommand } from './request-email-verification.command.js';

/** Re-sends the verification email for the logged-in user. Already verified = no-op. */
@CommandHandler(RequestEmailVerificationCommand)
export class RequestEmailVerificationHandler implements ICommandHandler<RequestEmailVerificationCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
  ) {}

  async execute({ userId }: RequestEmailVerificationCommand): Promise<{ accepted: true }> {
    const user = await this.users.findById(this.tx.db, userId);
    if (!user) throw new UserNotFoundError();
    if (user.emailVerifiedAt) return { accepted: true };

    const issued = this.tokens.issue('EMAIL_VERIFY', user.id);
    await this.tx.run(async (tx) => {
      await this.tokenRepo.insert(tx, issued.row);
      await this.outbox.publish(tx, {
        topic: OutboxTopics.EmailVerifyRequested,
        dedupeKey: issued.row.id,
        payload: {
          tokenId: issued.row.id,
          to: user.email,
          name: user.name,
          lang: user.languageCode,
          verifyUrl: this.links.verifyEmail(issued.raw),
          expiresInHours: this.config.env.EMAIL_VERIFY_TTL_HOURS,
        },
      });
    }, { userId: user.id });
    return { accepted: true };
  }
}
