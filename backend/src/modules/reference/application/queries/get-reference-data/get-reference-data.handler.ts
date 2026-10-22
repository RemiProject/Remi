import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { REFERENCE_REPOSITORY, type ReferenceRepository } from '@/modules/reference/domain/ports/reference.repository.js';
import { GetReferenceDataQuery, type ReferenceRows } from './get-reference-data.query.js';

@QueryHandler(GetReferenceDataQuery)
export class GetReferenceDataHandler implements IQueryHandler<GetReferenceDataQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(REFERENCE_REPOSITORY) private readonly repo: ReferenceRepository,
  ) {}

  execute({ kind }: GetReferenceDataQuery): Promise<ReferenceRows> {
    const db = this.tx.db;
    switch (kind) {
      case 'COUNTRY': return this.repo.countries(db);
      case 'LANGUAGE': return this.repo.languages(db);
      case 'LOCALE': return this.repo.locales(db);
      case 'CUISINE': return this.repo.cuisines(db);
      case 'FOOD_CATEGORY': return this.repo.foodCategories(db);
      case 'CURRENCY': return this.repo.currencies(db);
    }
  }
}
