import { Query } from '@nestjs/cqrs';

export interface MeView { id: string; email: string; name: string; timezone: string; emailVerifiedAt: Date | null; languageCode: string }

export class GetMeQuery extends Query<MeView> {
  constructor(public readonly userId: string) { super(); }
}
