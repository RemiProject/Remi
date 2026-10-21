import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { IsSessionActiveQuery } from '@/platform/tenancy/is-session-active.query.js';
import { SESSION_REPOSITORY, type SessionRepository } from '@/modules/identity/domain/ports/session.repository.js';

@QueryHandler(IsSessionActiveQuery)
export class IsSessionActiveHandler implements IQueryHandler<IsSessionActiveQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  execute({ sessionId, userId }: IsSessionActiveQuery): Promise<boolean> {
    return this.sessions.isActive(this.tx.db, sessionId, userId);
  }
}
