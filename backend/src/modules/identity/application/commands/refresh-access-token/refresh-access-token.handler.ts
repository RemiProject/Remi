import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { TOKEN_SIGNER, type AuthTokens, type TokenSignerPort } from '@/modules/identity/domain/ports/token-signer.port.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { RefreshAccessTokenCommand } from './refresh-access-token.command.js';

const invalid = () => new DomainError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);

/**
 * Session-backed refresh with rotation (B7A):
 *  - lock row by hash FOR UPDATE
 *  - missing / expired / revoked → 401
 *  - already rotated (reuse) → revoke whole family → 401
 *  - otherwise mark rotated, insert successor, issue new pair bound to new session id
 */
@CommandHandler(RefreshAccessTokenCommand)
export class RefreshAccessTokenHandler implements ICommandHandler<RefreshAccessTokenCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly config: AppConfigService,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSignerPort,
  ) {}

  async execute({ refreshToken }: RefreshAccessTokenCommand): Promise<AuthTokens> {
    const hash = hashToken(refreshToken);
    const nextRefresh = this.signer.createRefreshToken();
    const nextId = newId();
    const expiresAt = new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

    const userId = await this.tx.run(async (tx) => {
      const row = await this.sessions.findByRefreshHashForUpdate(tx, hash);
      if (!row) throw invalid();
      if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) throw invalid();

      if (row.rotatedAt) {
        // Reuse of an already-rotated token → possible theft → kill the family.
        await this.sessions.revokeFamily(tx, row.familyId);
        throw invalid();
      }

      if (!(await this.users.findById(tx, row.userId))) throw invalid();

      await this.sessions.rotate(tx, {
        currentId: row.id,
        next: {
          id: nextId,
          userId: row.userId,
          familyId: row.familyId,
          refreshTokenHash: nextRefresh.hash,
          expiresAt,
          userAgent: null,
        },
      });
      return row.userId;
    });

    // Access JWT is bound to the *new* session id so logout can revoke it.
    const access = await this.signer.issueAccess(userId, nextId);
    return {
      accessToken: access.accessToken,
      refreshToken: nextRefresh.raw,
      expiresInSeconds: access.expiresInSeconds,
    };
  }
}
