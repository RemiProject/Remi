import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { newId } from '@/shared/ids.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { RequestPasswordResetCommand } from './request-password-reset.command.js';

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<RequestPasswordResetCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly outbox: OutboxPublisher,
  ) {}

  /**
   * Always answers "accepted" and does the same work for every email: one outbox row, no account lookup.
   * The lookup worker finds the account, applies the limits and queues the email (process-password-reset-lookup).
   */
  async execute({ email }: RequestPasswordResetCommand): Promise<{ accepted: true }> {
    await this.tx.run(tx => this.outbox.publish(tx, {
      topic: OutboxTopics.PasswordResetLookup,
      dedupeKey: newId(),
      payload: { email: normalizeEmail(email) },
    }));
    return { accepted: true };
  }
}
