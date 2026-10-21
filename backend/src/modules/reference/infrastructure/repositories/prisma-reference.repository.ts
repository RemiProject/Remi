import { Injectable } from '@nestjs/common';
import type { Tx } from '@/platform/db/tx-context.js';
import type { CodeName, CurrencyRow, LanguageRow, LocaleRow, ReferenceRepository, RegistrationRefs } from '@/modules/reference/domain/ports/reference.repository.js';

@Injectable()
export class PrismaReferenceRepository implements ReferenceRepository {
  countries(db: Tx): Promise<CodeName[]> {
    return db.country.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
  }

  languages(db: Tx): Promise<LanguageRow[]> {
    return db.language.findMany({ select: { id: true, code: true, name: true, isRtl: true }, orderBy: { code: 'asc' } });
  }

  async locales(db: Tx): Promise<LocaleRow[]> {
    const rows = await db.locale.findMany({
      select: { id: true, code: true, name: true, languageId: true, language: { select: { code: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, languageId: r.languageId, languageCode: r.language.code }));
  }

  cuisines(db: Tx): Promise<CodeName[]> {
    return db.cuisine.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
  }

  foodCategories(db: Tx): Promise<CodeName[]> {
    return db.foodCategory.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
  }

  currencies(db: Tx): Promise<CurrencyRow[]> {
    return db.currency.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, symbol: true, decimalPlaces: true }, orderBy: { code: 'asc' } });
  }

  async resolveRegistration(db: Tx, countryCode: string, localeCode: string, languageCode?: string): Promise<RegistrationRefs | null> {
    const [country, locale] = await Promise.all([
      db.country.findUnique({ where: { code: countryCode }, select: { id: true } }),
      db.locale.findUnique({ where: { code: localeCode }, select: { id: true, language: { select: { id: true, code: true } } } }),
    ]);
    if (!country || !locale) return null;
    const language = languageCode
      ? await db.language.findUnique({ where: { code: languageCode }, select: { id: true, code: true } })
      : locale.language;
    return language ? { countryId: country.id, localeId: locale.id, languageId: language.id, languageCode: language.code } : null;
  }
}
