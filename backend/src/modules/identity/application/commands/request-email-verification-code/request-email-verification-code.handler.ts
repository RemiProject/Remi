import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { RequestEmailVerificationCommand } from '@/modules/identity/application/commands/request-email-verification/request-email-verification.command.js';
import { RequestEmailVerificationCodeCommand } from './request-email-verification-code.command.js';
import { UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';

@CommandHandler(RequestEmailVerificationCodeCommand)
export class RequestEmailVerificationCodeHandler implements ICommandHandler<RequestEmailVerificationCodeCommand> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly codes: EmailVerificationCodeService,
    private readonly commands: CommandBus,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute({ email }: RequestEmailVerificationCodeCommand): Promise<{ accepted: true }> {
    this.codes.requireEnabled();
    const user = await this.users.findByEmail(this.transactions.db, normalizeEmail(email));
    if (user) {
      try { await this.commands.execute(new RequestEmailVerificationCommand(user.id)); }
      catch (error) { if (!(error instanceof UserNotFoundError)) throw error; } // Account deletion raced the lookup.
    }
    return { accepted: true };
  }
}
