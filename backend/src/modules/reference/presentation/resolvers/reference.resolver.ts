import { QueryBus } from '@nestjs/cqrs';
import { Query, Resolver } from '@nestjs/graphql';
import { GetReferenceDataQuery } from '@/modules/reference/application/queries/get-reference-data/get-reference-data.query.js';
import type { CodeName, CurrencyRow, LanguageRow, LocaleRow } from '@/modules/reference/domain/ports/reference.repository.js';
import { CountryType, CuisineType, CurrencyType, FoodCategoryType, LanguageType, LocaleType } from '@/modules/reference/presentation/types/reference.types.js';

/** Public lookups (needed by the registration screen), so no auth guard. */
@Resolver()
export class ReferenceResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query(() => [CountryType]) countries() { return this.queryBus.execute(new GetReferenceDataQuery('COUNTRY')) as Promise<CodeName[]>; }
  @Query(() => [LanguageType]) languages() { return this.queryBus.execute(new GetReferenceDataQuery('LANGUAGE')) as Promise<LanguageRow[]>; }
  @Query(() => [LocaleType]) locales() { return this.queryBus.execute(new GetReferenceDataQuery('LOCALE')) as Promise<LocaleRow[]>; }
  @Query(() => [CuisineType]) cuisines() { return this.queryBus.execute(new GetReferenceDataQuery('CUISINE')) as Promise<CodeName[]>; }
  @Query(() => [FoodCategoryType]) foodCategories() { return this.queryBus.execute(new GetReferenceDataQuery('FOOD_CATEGORY')) as Promise<CodeName[]>; }
  @Query(() => [CurrencyType]) currencies() { return this.queryBus.execute(new GetReferenceDataQuery('CURRENCY')) as Promise<CurrencyRow[]>; }
}
