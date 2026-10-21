import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { MyHouseholdView } from '@/modules/identity/domain/entities/identity.records.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { ListMyHouseholdsQuery } from './list-my-households.query.js';

@QueryHandler(ListMyHouseholdsQuery)
export class ListMyHouseholdsHandler implements IQueryHandler<ListMyHouseholdsQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  execute({ userId }: ListMyHouseholdsQuery): Promise<MyHouseholdView[]> {
    return this.members.listHouseholdsOfUser(this.tx.db, userId);
  }
}
