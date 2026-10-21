import { Query } from '@nestjs/cqrs';
import type { RegistrationRefs } from '@/modules/reference/domain/ports/reference.repository.js';

/** Public contract of the reference module: other modules ask through the QueryBus instead of importing repositories. */
export class ResolveRegistrationReferencesQuery extends Query<RegistrationRefs | null> {
  constructor(
    public readonly countryCode: string,
    public readonly localeCode: string,
    public readonly languageCode?: string,
  ) {
    super();
  }
}
