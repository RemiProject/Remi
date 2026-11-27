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
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { ProcessPasswordResetLookupCommand, type PasswordResetLookupOutcome } from './process-password-reset-lookup.command.js';

@CommandHandler(ProcessPasswordResetLookupCommand)
export class ProcessPasswordResetLookupHandler implements ICommandHandler<ProcessPasswordResetLookupCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    private readonly codes: PasswordResetCodeService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
  ) {}

  /**
   * One transaction: record the reset email under the shared cooldown and daily cap, issue the link token, queue the
   * existing reset email (with the challenge ID, never the code), and blank the email from the lookup row.
   * Unknown, deleted, cooled-down and capped accounts get nothing, and their lookup row is blanked all the same.
   */
  async execute({ lookupId, email }: ProcessPasswordResetLookupCommand): Promise<{ outcome: PasswordResetLookupOutcome }> {
    const normalized = typeof email === 'string' ? normalizeEmail(email) : '';
    const user = normalized ? await this.users.findByEmail(this.tx.db, normalized) : null;
    const outcome = await this.tx.run(async (tx): Promise<PasswordResetLookupOutcome> => {
      let result: PasswordResetLookupOutcome = 'not-sent';
      if (user) {
        const issued = await this.codes.issueWithinTransaction(tx, user.id);
        if (issued.status === 'issued' || issued.status === 'link-only') {
          const token = this.tokens.issue('PASSWORD_RESET', user.id);
          await this.tokenRepo.insert(tx, token.row);
          await this.outbox.publish(tx, {
            topic: OutboxTopics.PasswordResetRequested,
            dedupeKey: token.row.id,
            payload: {
              tokenId: token.row.id,
              to: user.email,
              name: user.name,
              lang: user.languageCode,
              resetUrl: this.links.resetPassword(token.raw),
              expiresInMinutes: this.config.env.PASSWORD_RESET_TTL_MIN,
              ...(issued.status === 'issued' ? { codeChallengeId: issued.challenge.id } : {}),
            },
          });
          result = issued.status === 'issued' ? 'queued-with-code' : 'queued-link-only';
        }
      }
      await this.outbox.clearPayload(tx, lookupId);
      return result;
    }, user ? { userId: user.id } : {});
    return { outcome };
  }
}
