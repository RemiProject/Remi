import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { GetMeQuery, type MeView } from './get-me.query.js';

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute({ userId }: GetMeQuery): Promise<MeView> {
    const u = await this.users.findById(this.tx.db, userId);
    if (!u) throw new UserNotFoundError();
    return { id: u.id, email: u.email, name: u.name, timezone: u.timezone, emailVerifiedAt: u.emailVerifiedAt, languageCode: u.languageCode };
  }
}
