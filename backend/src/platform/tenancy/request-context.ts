export type HouseholdRoleName = 'OWNER' | 'MEMBER';

/** Built by the guards, never by the client body. */
export interface RequestContext {
  userId: string;
  /** Session id from access JWT — present after GqlAuthGuard. */
  sessionId?: string;
  householdId?: string;
  householdRole?: HouseholdRoleName;
}
