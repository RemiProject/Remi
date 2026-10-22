import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';
import { LogoutAllCommand } from './logout-all.command.js';

@CommandHandler(LogoutAllCommand)
export class LogoutAllHandler implements ICommandHandler<LogoutAllCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  async execute({ userId }: LogoutAllCommand): Promise<void> {
    await this.tx.run((tx) => this.sessions.revokeAllForUser(tx, userId), { userId });
  }
}
