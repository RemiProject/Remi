import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { REFERENCE_REPOSITORY, type ReferenceRepository, type RegistrationRefs } from '@/modules/reference/domain/ports/reference.repository.js';
import { ResolveRegistrationReferencesQuery } from './resolve-registration-references.query.js';

@QueryHandler(ResolveRegistrationReferencesQuery)
export class ResolveRegistrationReferencesHandler implements IQueryHandler<ResolveRegistrationReferencesQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(REFERENCE_REPOSITORY) private readonly repo: ReferenceRepository,
  ) {}

  execute(q: ResolveRegistrationReferencesQuery): Promise<RegistrationRefs | null> {
    return this.repo.resolveRegistration(this.tx.db, q.countryCode.toUpperCase(), q.localeCode, q.languageCode?.toLowerCase());
  }
}
