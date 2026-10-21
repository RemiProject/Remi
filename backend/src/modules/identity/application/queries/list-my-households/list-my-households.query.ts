import { Query } from '@nestjs/cqrs';
import type { MyHouseholdView } from '@/modules/identity/domain/entities/identity.records.js';

export class ListMyHouseholdsQuery extends Query<MyHouseholdView[]> {
  constructor(public readonly userId: string) { super(); }
}
