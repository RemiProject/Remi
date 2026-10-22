import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { MailService } from '@/platform/mail/mail.service.js';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';

@Injectable()
@OutboxHandler(OutboxTopics.EmailVerifyRequested)
export class SendVerificationEmailHandler implements OutboxHandlerPort {
  constructor(
    private readonly mail: MailService,
    private readonly tx: TransactionRunner,
    @Inject(TOKEN_REPOSITORY) private readonly tokens: TokenRepository,
  ) {}

  async handle({ payload: p }: OutboxMessage): Promise<void> {
    // Idempotent: a retry never emails someone whose token is already used or expired.
    if (!(await this.tokens.isUsable(this.tx.db, p.tokenId))) return;
    await this.mail.send({ to: p.to, template: 'verify-email', lang: p.lang, vars: { name: p.name, verifyUrl: p.verifyUrl, expiresInHours: p.expiresInHours } });
  }
}
