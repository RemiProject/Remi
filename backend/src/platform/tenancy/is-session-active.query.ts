import { Query } from '@nestjs/cqrs';

/**
 * Contract owned by tenancy, answered by the identity module.
 * Used by GqlAuthGuard so logout / logout-all revoke access immediately
 * (not only refresh), without platform importing Session tables.
 */
export class IsSessionActiveQuery extends Query<boolean> {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
  ) {
    super();
  }
}
