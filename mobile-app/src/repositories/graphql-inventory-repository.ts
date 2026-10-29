import type { BackendInventoryItemDetail } from '../domain/backend-inventory';
import { mapInventoryReadItem } from '../domain/backend-inventory-read-model';
import { parseDecimal } from '../domain/inventory-decimal';
import { getActiveHouseholdRevision, resolveActiveHousehold, type ActiveHouseholdStorage } from '../services/active-household-service';
import type { createAuthService } from '../services/auth-service';
import { isBackendInventoryEnabled } from '../services/inventory-feature';
import type { BackendInventoryReadRepository, BackendInventoryRepository } from './backend-inventory-repository';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql' | 'getIdentityContext' | 'getIdentityRevision'>;
const itemFields = 'id foodId foodName quantity unit storageLocation estimatedExpiryAt version';
export const inventoryReadOperations = {
  list: `query Inventory($first: Int!, $after: String) { inventory(first: $first, after: $after) { nodes { ${itemFields} } hasNextPage endCursor } }`,
  get: `query InventoryItem($id: ID!) { inventoryItem(id: $id) { ${itemFields} transactions { nodes { id eventId movementType quantityDelta balanceAfter createdAt } hasNextPage endCursor } } }`,
} as const;

export class InventoryReadError extends Error {
  constructor(readonly code: 'STALE_CONTEXT' | 'INVALID_RESPONSE', message: string) {
    super(message);
    this.name = 'InventoryReadError';
  }
}

/** Disabled means no auth, storage or network work. Never selects a local repository. */
export function createGraphqlInventoryRepository(auth: Auth, storage: ActiveHouseholdStorage): BackendInventoryReadRepository | undefined {
  if (!isBackendInventoryEnabled()) return undefined;

  const stale = () => new InventoryReadError('STALE_CONTEXT', 'Your account or active household changed. Inventory results were discarded; please reload.');
  async function context() {
    const identity = await auth.getIdentityContext();
    const household = await resolveActiveHousehold(auth, storage);
    if (identity.revision !== auth.getIdentityRevision()) throw stale();
    return { identity, household, householdRevision: getActiveHouseholdRevision(auth) };
  }
  type Context = Awaited<ReturnType<typeof context>>;
  function assertContext(current: Context) {
    if (current.identity.revision !== auth.getIdentityRevision()
      || current.householdRevision !== getActiveHouseholdRevision(auth)) throw stale();
  }
  async function revalidate(current: Context) {
    assertContext(current);
    const household = await resolveActiveHousehold(auth, storage);
    assertContext(current);
    if (household.id !== current.household.id || household.timezone !== current.household.timezone) throw stale();
  }
  async function request<T>(current: Context, query: string, variables: Record<string, unknown>): Promise<T> {
    assertContext(current);
    try {
      const result = await auth.authenticatedGraphql<T>(query, variables, current.household.id);
      await revalidate(current);
      return result;
    } catch (error) {
      // Auth may reject a late response before returning it to this repository.
      assertContext(current);
      throw error;
    }
  }

  return {
    async list() {
      const current = await context();
      // Reuse the command contract's raw paginated read shape internally.
      const pages: Pick<BackendInventoryRepository, 'list'> = {
        async list(input) {
          const data = await request<{ inventory: Awaited<ReturnType<BackendInventoryRepository['list']>> }>(
            current, inventoryReadOperations.list, { first: input?.first ?? 50, after: input?.after ?? null });
          return data.inventory;
        },
      };
      const items = [];
      const cursors = new Set<string>();
      let after: string | null = null;
      do {
        const page = await pages.list({ after });
        if (!page || !Array.isArray(page.nodes) || typeof page.hasNextPage !== 'boolean') {
          throw new InventoryReadError('INVALID_RESPONSE', 'Invalid inventory page returned by the backend.');
        }
        for (const item of page.nodes) {
          if (parseDecimal(item.quantity) !== 0n) items.push(mapInventoryReadItem(item, current.household.timezone));
        }
        if (!page.hasNextPage) break;
        if (!page.endCursor || cursors.has(page.endCursor)) {
          throw new InventoryReadError('INVALID_RESPONSE', 'Inventory pagination did not advance.');
        }
        cursors.add(page.endCursor);
        after = page.endCursor;
      } while (true);
      assertContext(current);
      return items;
    },
    async get(id) {
      const current = await context();
      const data = await request<{ inventoryItem: BackendInventoryItemDetail }>(current, inventoryReadOperations.get, { id });
      assertContext(current);
      if (!data.inventoryItem || data.inventoryItem.id !== id || !data.inventoryItem.transactions) {
        throw new InventoryReadError('INVALID_RESPONSE', 'Invalid inventory batch returned by the backend.');
      }
      return { ...mapInventoryReadItem(data.inventoryItem, current.household.timezone), transactions: data.inventoryItem.transactions };
    },
  };
}
