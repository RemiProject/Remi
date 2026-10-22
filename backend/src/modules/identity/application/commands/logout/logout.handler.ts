import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { LogoutCommand } from './logout.command.js';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  async execute({ userId, refreshToken }: LogoutCommand): Promise<void> {
    const hash = hashToken(refreshToken);
    await this.tx.run(
      async (tx) => {
        const row = await this.sessions.findByRefreshHashForUpdate(tx, hash);
        if (!row || row.userId !== userId) return; // idempotent: already gone or not yours
        if (row.revokedAt) return;
        await this.sessions.revokeById(tx, userId, row.id);
        // Also revoke any rotated siblings in the family so the chain cannot be revived.
        await this.sessions.revokeFamily(tx, row.familyId);
      },
      { userId },
    );
  }
}
