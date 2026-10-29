import type { createAuthService } from './auth-service';

export interface Household {
  id: string;
  name: string;
  timezone: string;
}

export interface HouseholdMembership {
  household: Household;
  joinedAt: string;
  role: 'OWNER' | 'MEMBER';
}

export const myHouseholdsQuery = 'query MyHouseholds { myHouseholds { household { id name timezone } joinedAt role } }';

/** Read only: does not create, select or persist a household. */
export async function loadMyHouseholds(
  auth: Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql'>,
): Promise<HouseholdMembership[]> {
  const data = await auth.authenticatedGraphql<{ myHouseholds: HouseholdMembership[] }>(myHouseholdsQuery);
  return data.myHouseholds;
}
