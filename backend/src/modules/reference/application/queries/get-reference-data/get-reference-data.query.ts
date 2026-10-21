import { Query } from '@nestjs/cqrs';
import type { CodeName, CurrencyRow, LanguageRow, LocaleRow, ReferenceKind } from '@/modules/reference/domain/ports/reference.repository.js';

export type ReferenceRows = CodeName[] | CurrencyRow[] | LanguageRow[] | LocaleRow[];

export class GetReferenceDataQuery extends Query<ReferenceRows> {
  constructor(public readonly kind: ReferenceKind) {
    super();
  }
}
