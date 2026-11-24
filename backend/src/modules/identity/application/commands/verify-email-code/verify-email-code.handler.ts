import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { EmailVerifiedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { VerifyEmailCodeCommand } from './verify-email-code.command.js';

@CommandHandler(VerifyEmailCodeCommand)
export class VerifyEmailCodeHandler implements ICommandHandler<VerifyEmailCodeCommand> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly codes: EmailVerificationCodeService,
    private readonly events: EventBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute({ email, code }: VerifyEmailCodeCommand): Promise<{ verified: true }> {
    this.codes.requireEnabled();
    const user = await this.users.findByEmail(this.transactions.db, normalizeEmail(email));
    await this.codes.verify(user?.id ?? null, code);
    this.events.publish(new EmailVerifiedEvent(user!.id));
    return { verified: true };
  }
}
