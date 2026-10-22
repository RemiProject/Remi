import type { Tx } from '@/platform/db/tx-context.js';

export const REFERENCE_REPOSITORY = Symbol('REFERENCE_REPOSITORY');

export interface CodeName { id: string; code: string; name: string }
export interface LanguageRow extends CodeName { isRtl: boolean }
export interface LocaleRow extends CodeName { languageId: string; languageCode: string }
export interface CurrencyRow { id: string; code: string; name: string; symbol: string; decimalPlaces: number }

export interface RegistrationRefs {
  countryId: string;
  localeId: string;
  languageId: string;
  languageCode: string;
}

export type ReferenceKind = 'COUNTRY' | 'LANGUAGE' | 'LOCALE' | 'CUISINE' | 'FOOD_CATEGORY' | 'CURRENCY';

export interface ReferenceRepository {
  countries(db: Tx): Promise<CodeName[]>;
  languages(db: Tx): Promise<LanguageRow[]>;
  locales(db: Tx): Promise<LocaleRow[]>;
  cuisines(db: Tx): Promise<CodeName[]>;
  foodCategories(db: Tx): Promise<CodeName[]>;
  currencies(db: Tx): Promise<CurrencyRow[]>;
  resolveRegistration(db: Tx, countryCode: string, localeCode: string, languageCode?: string): Promise<RegistrationRefs | null>;
}
