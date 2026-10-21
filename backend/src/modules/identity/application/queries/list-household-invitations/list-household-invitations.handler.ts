import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { InvitationView } from '@/modules/identity/domain/entities/identity.records.js';
import { HOUSEHOLD_INVITATION_REPOSITORY, type HouseholdInvitationRepository } from '@/modules/identity/domain/ports/household-invitation.repository.js';
import { ListHouseholdInvitationsQuery } from './list-household-invitations.query.js';

@QueryHandler(ListHouseholdInvitationsQuery)
export class ListHouseholdInvitationsHandler implements IQueryHandler<ListHouseholdInvitationsQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(HOUSEHOLD_INVITATION_REPOSITORY) private readonly invitations: HouseholdInvitationRepository,
  ) {}

  execute({ householdId }: ListHouseholdInvitationsQuery): Promise<InvitationView[]> {
    return this.invitations.listOpen(this.tx.db, householdId);
  }
}
