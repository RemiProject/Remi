import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { newId } from '@/shared/ids.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { PASSWORD_HASHER, type PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { TOKEN_SIGNER, type AuthTokens, type TokenSignerPort } from '@/modules/identity/domain/ports/token-signer.port.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { EmailNotVerifiedError, InvalidCredentialsError } from '@/modules/identity/domain/services/identity.errors.js';
import { LoginCommand } from './login.command.js';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  private dummyHash?: string;

  constructor(
    private readonly tx: TransactionRunner,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSignerPort,
  ) {}

  async execute({ email, password, userAgent }: LoginCommand): Promise<AuthTokens> {
    const user = await this.users.findByEmail(this.tx.db, normalizeEmail(email));
    // Same work and same error whether the email exists or not (no user enumeration, no timing oracle).
    let ok = false;
    if (user) ok = await this.hasher.verify(user.passwordHash, password);
    else await this.hasher.verify((this.dummyHash ??= await this.hasher.hash('dummy-password')), password);
    if (!user || !ok) throw new InvalidCredentialsError();
    if (this.config.env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt) throw new EmailNotVerifiedError();

    const refresh = this.signer.createRefreshToken();
    const sessionId = newId();
    const familyId = newId();
    const expiresAt = new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

    await this.tx.run(
      async (tx) => {
        await this.users.touchLogin(tx, user.id);
        await this.sessions.insert(tx, {
          id: sessionId,
          userId: user.id,
          familyId,
          refreshTokenHash: refresh.hash,
          expiresAt,
          userAgent: userAgent ?? null,
        });
      },
      { userId: user.id },
    );

    const access = await this.signer.issueAccess(user.id, sessionId);
    return {
      accessToken: access.accessToken,
      refreshToken: refresh.raw,
      expiresInSeconds: access.expiresInSeconds,
    };
  }
}
