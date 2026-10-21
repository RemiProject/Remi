import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { MemberView } from '@/modules/identity/domain/entities/identity.records.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';
import { ListHouseholdMembersQuery } from './list-household-members.query.js';

@QueryHandler(ListHouseholdMembersQuery)
export class ListHouseholdMembersHandler implements IQueryHandler<ListHouseholdMembersQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  execute({ householdId }: ListHouseholdMembersQuery): Promise<MemberView[]> {
    return this.members.listActive(this.tx.db, householdId);
  }
}
