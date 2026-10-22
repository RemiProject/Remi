import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { RequestPasswordResetCommand } from './request-password-reset.command.js';

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<RequestPasswordResetCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
  ) {}

  /** Always answers "accepted": never reveal whether the email exists. */
  async execute({ email }: RequestPasswordResetCommand): Promise<{ accepted: true }> {
    const user = await this.users.findByEmail(this.tx.db, normalizeEmail(email));
    if (!user) return { accepted: true };

    const issued = this.tokens.issue('PASSWORD_RESET', user.id);
    await this.tx.run(async (tx) => {
      await this.tokenRepo.insert(tx, issued.row);
      await this.outbox.publish(tx, {
        topic: OutboxTopics.PasswordResetRequested,
        dedupeKey: issued.row.id,
        payload: {
          tokenId: issued.row.id,
          to: user.email,
          name: user.name,
          lang: user.languageCode,
          resetUrl: this.links.resetPassword(issued.raw),
          expiresInMinutes: this.config.env.PASSWORD_RESET_TTL_MIN,
        },
      });
    }, { userId: user.id });
    return { accepted: true };
  }
}
