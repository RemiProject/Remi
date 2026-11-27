import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { VerifyPasswordResetCodeCommand } from './verify-password-reset-code.command.js';

/** Exchanges a correct reset code for a single-use reset token. Every failure is INVALID_PASSWORD_RESET_CODE. */
@CommandHandler(VerifyPasswordResetCodeCommand)
export class VerifyPasswordResetCodeHandler implements ICommandHandler<VerifyPasswordResetCodeCommand> {
  constructor(private readonly codes: PasswordResetCodeService) {}

  execute({ email, code }: VerifyPasswordResetCodeCommand): Promise<{ resetToken: string; expiresAt: Date }> {
    return this.codes.exchange(email, code);
  }
}
