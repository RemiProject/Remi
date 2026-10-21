import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { GetActiveMembershipQuery, type ActiveMembership } from '@/platform/tenancy/get-active-membership.query.js';
import { HOUSEHOLD_MEMBER_REPOSITORY, type HouseholdMemberRepository } from '@/modules/identity/domain/ports/household-member.repository.js';

@QueryHandler(GetActiveMembershipQuery)
export class GetActiveMembershipHandler implements IQueryHandler<GetActiveMembershipQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(HOUSEHOLD_MEMBER_REPOSITORY) private readonly members: HouseholdMemberRepository,
  ) {}

  async execute({ userId, householdId }: GetActiveMembershipQuery): Promise<ActiveMembership | null> {
    const m = await this.members.findActive(this.tx.db, householdId, userId);
    return m ? { householdId, userId, role: m.role } : null;
  }
}
