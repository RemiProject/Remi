import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { newId } from '@/shared/ids.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { RequestEmailVerificationCodeCommand } from './request-email-verification-code.command.js';

@CommandHandler(RequestEmailVerificationCodeCommand)
export class RequestEmailVerificationCodeHandler implements ICommandHandler<RequestEmailVerificationCodeCommand> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly codes: EmailVerificationCodeService,
  ) {}

  /**
   * Always answers "accepted" and does the same work for every email: one outbox row, no account lookup, so neither the
   * answer nor its timing reveals whether the email exists, is verified or is rate limited. The lookup worker does the rest
   * (process-email-verification-code-lookup).
   */
  async execute({ email }: RequestEmailVerificationCodeCommand): Promise<{ accepted: true }> {
    // Without codes there is no per-account cooldown, so this unauthenticated path must not send link-only mail.
    if (!this.codes.isEnabled) return { accepted: true };
    await this.transactions.run(tx => this.outbox.publish(tx, {
      topic: OutboxTopics.EmailVerificationCodeLookup,
      dedupeKey: newId(),
      payload: { email: normalizeEmail(email) },
    }));
    return { accepted: true };
  }
}
