import { Inject, Injectable } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { CATALOG_REPOSITORY, type CatalogRepository } from '@/modules/catalog/domain/ports/catalog.repository.js';
import { DomainError } from '@/shared/domain-error.js';
import { GetFoodQuery, SearchFoodsQuery } from './search-foods.query.js';
import type { FoodConnection, FoodRow } from '@/modules/catalog/domain/food.types.js';

const encodeCursor = (id: string) => Buffer.from(id).toString('base64url');

function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new DomainError('INVALID_CURSOR', 'The foods cursor is invalid.');
  }
  return id;
}

@QueryHandler(SearchFoodsQuery)
@Injectable()
export class SearchFoodsHandler implements IQueryHandler<SearchFoodsQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
  ) {}

  async execute(query: SearchFoodsQuery): Promise<FoodConnection> {
    const connection = await this.repo.search(this.tx.db, query.search?.trim(), query.first, query.after ? decodeCursor(query.after) : undefined);
    return { ...connection, endCursor: connection.endCursor ? encodeCursor(connection.endCursor) : null };
  }
}

@QueryHandler(GetFoodQuery)
@Injectable()
export class GetFoodHandler implements IQueryHandler<GetFoodQuery> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
  ) {}

  execute({ id }: GetFoodQuery): Promise<FoodRow | null> {
    return this.repo.findById(this.tx.db, id);
  }
}
