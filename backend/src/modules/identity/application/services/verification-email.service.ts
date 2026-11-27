import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import type { UserRecord } from '@/modules/identity/domain/entities/identity.records.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { EmailVerificationCodeService } from './email-verification-code.service.js';
import { LinkBuilder } from './link-builder.js';
import { OneTimeTokenService } from './one-time-token.service.js';

/**
 * Queues a verification email (a link, plus a code when codes are enabled) under the shared cooldown and daily cap.
 * Used by the logged-in resend and by the public code request's lookup worker.
 */
@Injectable()
export class VerificationEmailService {
  constructor(
    private readonly outbox: OutboxPublisher,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    private readonly codes: EmailVerificationCodeService,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
  ) {}

  /** Runs inside the caller's transaction. Returns whether an email was queued (false on cooldown, daily cap or not eligible). */
  async queueWithinTransaction(tx: Tx, user: UserRecord): Promise<boolean> {
    const code = await this.codes.issueWithinTransaction(tx, user.id);
    if (code.status !== 'issued' && code.status !== 'disabled') return false;
    const issued = this.tokens.issue('EMAIL_VERIFY', user.id);
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
        ...(code.status === 'issued' ? { codeChallengeId: code.challenge.id } : {}),
      },
    });
    return true;
  }
}
