import type { createAuthService } from './auth-service';
import { loadMyHouseholds, type Household } from './households-service';

export interface ActiveHouseholdStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type Auth = Pick<ReturnType<typeof createAuthService>,
  'authenticatedGraphql' | 'getIdentityContext' | 'getIdentityRevision'>;
type Identity = Awaited<ReturnType<Auth['getIdentityContext']>>;
interface SelectionStorage {
  storage: ActiveHouseholdStorage;
  queue: Promise<unknown>;
}
interface Resolution { household: Household; identity: Identity }
interface Coordinator {
  selections: Map<ActiveHouseholdStorage, SelectionStorage>;
  pending?: Promise<Resolution>;
}

export const createHouseholdMutation = 'mutation CreateHousehold($input: CreateHouseholdInput!) { createHousehold(input: $input) }';

export class ActiveHouseholdError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ActiveHouseholdError';
  }
}

// Share resolution across callers using the same auth instance, even if their
// storage adapters differ. This is a client guard, not cross-device idempotency.
const coordinators = new WeakMap<Auth, Coordinator>();

function enqueue<T>(selection: SelectionStorage, work: () => Promise<T>): Promise<T> {
  const result = selection.queue.then(work);
  selection.queue = result.catch(() => undefined);
  return result;
}

function coordinatorFor(auth: Auth) {
  let coordinator = coordinators.get(auth);
  if (!coordinator) {
    coordinator = { selections: new Map() };
    coordinators.set(auth, coordinator);
  }
  return coordinator;
}

function assertIdentity(auth: Auth, identity: Identity) {
  if (auth.getIdentityRevision() !== identity.revision) {
    throw new ActiveHouseholdError('Your account changed while selecting a household. Please try again.');
  }
}

async function select(auth: Auth, selection: SelectionStorage): Promise<Resolution> {
  const identity = await auth.getIdentityContext();
  assertIdentity(auth, identity);
  const key = `remy.active-household.v1:${JSON.stringify([identity.backendUrl, identity.userId])}`;
  const savedId = await enqueue(selection, () => selection.storage.getItem(key));
  assertIdentity(auth, identity);
  const memberships = await loadMyHouseholds(auth);
  assertIdentity(auth, identity);
  if (!Array.isArray(memberships) || memberships.some(m => !m?.household?.id)) {
    throw new ActiveHouseholdError('The backend returned invalid household memberships.');
  }
  let household = memberships.find(m => m.household.id === savedId)?.household ?? memberships[0]?.household;
  if (!household) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) throw new ActiveHouseholdError('Could not determine the device timezone.');
    // Reject invalid timezone values rather than sending a guessed timezone.
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    const input = { name: 'My Kitchen', timezone };
    const data = await auth.authenticatedGraphql<{ createHousehold: string }>(createHouseholdMutation, { input });
    assertIdentity(auth, identity);
    if (typeof data.createHousehold !== 'string' || !data.createHousehold) {
      throw new ActiveHouseholdError('The backend did not return the created household ID.');
    }
    household = { id: data.createHousehold, ...input };
  }
  return { household, identity };
}

/** No provider, screen or inventory fallback. Revalidate membership on every resolution. */
export async function resolveActiveHousehold(auth: Auth, storage: ActiveHouseholdStorage): Promise<Household> {
  try {
    const coordinator = coordinatorFor(auth);
    let selection = coordinator.selections.get(storage);
    if (!selection) {
      selection = { storage, queue: Promise.resolve() };
      coordinator.selections.set(storage, selection);
    }
    if (!coordinator.pending) {
      const pending = select(auth, selection);
      coordinator.pending = pending;
      // Clear both successful and rejected work, allowing explicit retries.
      void pending.then(() => { coordinator.pending = undefined; }, () => { coordinator.pending = undefined; });
    }
    const { household, identity } = await coordinator.pending;
    assertIdentity(auth, identity);
    const key = `remy.active-household.v1:${JSON.stringify([identity.backendUrl, identity.userId])}`;
    await enqueue(selection, async () => {
      assertIdentity(auth, identity);
      await storage.setItem(key, household.id);
      assertIdentity(auth, identity);
    });
    return household;
  } catch (error) {
    if (error instanceof ActiveHouseholdError) throw error;
    throw new ActiveHouseholdError('Could not resolve the active household. Check your connection and sign-in, then try again.', error);
  }
}
