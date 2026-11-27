import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { VerificationEmailService } from '@/modules/identity/application/services/verification-email.service.js';
import { ProcessEmailVerificationCodeLookupCommand, type EmailVerificationCodeLookupOutcome } from './process-email-verification-code-lookup.command.js';

@CommandHandler(ProcessEmailVerificationCodeLookupCommand)
export class ProcessEmailVerificationCodeLookupHandler implements ICommandHandler<ProcessEmailVerificationCodeLookupCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
    private readonly codes: EmailVerificationCodeService,
    private readonly emails: VerificationEmailService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * One transaction: queue the verification email for an unverified account, under the cooldown and daily cap shared
   * with registration and the logged-in resend, and blank the email from the lookup row. Unknown, deleted and verified
   * accounts get nothing, and their lookup row is blanked all the same. If codes were disabled after the request, nothing
   * is sent either: this public path never sends link-only mail.
   */
  async execute({ lookupId, email }: ProcessEmailVerificationCodeLookupCommand): Promise<{ outcome: EmailVerificationCodeLookupOutcome }> {
    const normalized = typeof email === 'string' ? normalizeEmail(email) : '';
    const user = normalized && this.codes.isEnabled ? await this.users.findByEmail(this.tx.db, normalized) : null;
    const queued = await this.tx.run(async (tx) => {
      // The account lock inside issuing re-checks verification and deletion.
      const sent = user && !user.emailVerifiedAt ? await this.emails.queueWithinTransaction(tx, user) : false;
      await this.outbox.clearPayload(tx, lookupId);
      return sent;
    }, user ? { userId: user.id } : {});
    return { outcome: queued ? 'queued' : 'not-sent' };
  }
}
