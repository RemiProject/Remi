import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { MailService } from '@/platform/mail/mail.service.js';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { passwordResetCodePolicy } from '@/modules/identity/application/services/password-reset-code.config.js';

@Injectable()
@OutboxHandler(OutboxTopics.PasswordResetRequested)
export class SendPasswordResetEmailHandler implements OutboxHandlerPort {
  constructor(
    private readonly mail: MailService,
    private readonly tx: TransactionRunner,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
    private readonly codes: PasswordResetCodeService,
  ) {}

  async handle({ payload: p }: OutboxMessage): Promise<void> {
    // Idempotent: a retry never emails someone whose token is already used or expired.
    if (!(await this.tokens.isUsable(this.tx.db, p.tokenId))) return;
    // Re-derived just before sending. A withheld code (locked account, used, replaced or expired) sends the link only.
    const code = p.codeChallengeId ? await this.codes.codeForEmail(p.codeChallengeId) : undefined;
    await this.mail.send({ to: p.to, template: 'reset-password', lang: p.lang, vars: {
      name: p.name, resetUrl: p.resetUrl, expiresInMinutes: p.expiresInMinutes,
      code, codeExpiresInMinutes: passwordResetCodePolicy.lifetimeMs / 60_000,
    } });
  }
}
