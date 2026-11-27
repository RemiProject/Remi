import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { VerificationEmailService } from '@/modules/identity/application/services/verification-email.service.js';
import { RequestEmailVerificationCommand } from './request-email-verification.command.js';

/** Re-sends the verification email for the logged-in user. Already verified = no-op. */
@CommandHandler(RequestEmailVerificationCommand)
export class RequestEmailVerificationHandler implements ICommandHandler<RequestEmailVerificationCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly emails: VerificationEmailService,
  ) {}

  async execute({ userId }: RequestEmailVerificationCommand): Promise<{ accepted: true }> {
    const user = await this.users.findById(this.tx.db, userId);
    if (!user) throw new UserNotFoundError();
    if (user.emailVerifiedAt) return { accepted: true };
    await this.tx.run(tx => this.emails.queueWithinTransaction(tx, user), { userId: user.id });
    return { accepted: true };
  }
}
