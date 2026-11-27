import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from './auth';
import { getActiveHouseholdRevision, resolveActiveHousehold } from './active-household-service';

export async function intakeRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const auth = getAuth();
  const identity = auth.getIdentityRevision();
  const household = await resolveActiveHousehold(auth, AsyncStorage);
  const revision = getActiveHouseholdRevision(auth);
  if (auth.getIdentityRevision() !== identity) throw new Error('Your account changed. Please reopen this screen.');
  const result = await auth.authenticatedGraphql<T>(query, variables, household.id);
  const current = await resolveActiveHousehold(auth, AsyncStorage);
  if (auth.getIdentityRevision() !== identity || current.id !== household.id || getActiveHouseholdRevision(auth) !== revision) {
    throw new Error('Your kitchen changed. Please reload.');
  }
  return result;
}
export const leftoverFields = 'id name portions cookedOn useBy storage status notes';
export interface Leftover {
  id: string; name: string; portions: number; cookedOn: string; useBy: string | null;
  storage: string; status: string; notes: string;
}
export function newIntakeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
