import type { BackendAddStockInput, BackendAddStockResult, BackendUnit } from '../domain/backend-inventory';
import { formatDecimal, parseDecimal } from '../domain/inventory-decimal';
import { toBackendStorage, toBackendUnit, toMobileUnit } from '../domain/inventory-enum-adapters';
import { inventoryEndOfDay } from '../domain/inventory-day';
import { isCalendarDate, type StorageId, type UnitId } from '../domain/inventory';
import { getActiveHouseholdRevision, resolveActiveHousehold, type ActiveHouseholdStorage } from './active-household-service';
import type { createAuthService } from './auth-service';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql' | 'getIdentityRevision' | 'getIdentityContext'>;
export interface CatalogChoice {
  id: string; name: string; defaultUnit: BackendUnit;
  aliases: { alias: string; languageCode: string; isPrimary: boolean }[];
}
export const addFoodOperations = {
  search: 'query AddFoodCatalog($search: String!, $after: String) { foods(search: $search, first: 20, after: $after) { nodes { id name defaultUnit aliases { alias languageCode isPrimary } } hasNextPage endCursor } }',
  add: 'mutation AddKitchenFood($input: InventoryStockInput!) { addStock(input: $input) { __typename ... on InventoryMutationSuccessType { eventId replayed foodId quantity unit balances { inventoryItemId quantityDelta balanceAfter } } ... on InsufficientStockType { available unit } } }',
} as const;

export function catalogChoiceName(food: CatalogChoice, language: 'en' | 'ar'): string {
  const aliases = food.aliases.filter(a => /^ar(?:[-_]|$)/i.test(a.languageCode) && a.alias.trim());
  if (language === 'ar') return (aliases.find(a => a.isPrimary) ?? aliases[0])?.alias.trim() || food.name;
  return food.name.charAt(0).toUpperCase() + food.name.slice(1);
}

/** Normalize input characters only; all arithmetic remains exact thousandths. */
export function addFoodQuantity(text: string): string {
  const normalized = text.trim().replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  }).replace(/[,٫]/g, '.');
  const value = parseDecimal(normalized);
  if (value <= 0n) throw new Error('Quantity must be positive.');
  return formatDecimal(value);
}

export interface AddFoodDraft {
  search: string; food: CatalogChoice | null; quantity: string; unit: UnitId | '';
  storage: StorageId; purchaseDate: string; expiryDay: string;
}
export type AddFoodErrors = Partial<Record<'food' | 'quantity' | 'unit' | 'storage' | 'purchaseDate' | 'expiryDay', 'required' | 'quantity' | 'date' | 'dateOrder'>>;
const emptyDraft = (): AddFoodDraft => ({ search: '', food: null, quantity: '', unit: '', storage: 'refrigerator', purchaseDate: '', expiryDay: '' });
interface Snapshot {
  draft: AddFoodDraft; results: CatalogChoice[]; cursor: string | null;
  searchStatus: 'idle' | 'loading' | 'ready' | 'error';
  saving: boolean; errors: AddFoodErrors; error: unknown | null;
}
let sequence = 0;
function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-add-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** In-memory draft and retry envelope. Never reads or writes local inventory. */
export class BackendAddFoodStore {
  private snapshot: Snapshot = { draft: emptyDraft(), results: [], cursor: null, searchStatus: 'idle', saving: false, errors: {}, error: null };
  private listeners = new Set<() => void>();
  private searchVersion = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private readonly identity: number;
  private pending?: { input: Readonly<BackendAddStockInput>; householdId: string; timezone: string; householdRevision: number };
  constructor(private readonly auth: Auth, private readonly storage: ActiveHouseholdStorage, private readonly key = newKey) {
    this.identity = auth.getIdentityRevision();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach(listener => listener());
  }
  assertIdentity = () => {
    if (this.disposed || this.identity !== this.auth.getIdentityRevision()) throw new Error('Your account changed. Reopen Add food.');
  };
  activate = () => { this.disposed = false; };
  dispose = () => { this.disposed = true; clearTimeout(this.timer); this.searchVersion++; };
  change = (field: Exclude<keyof AddFoodDraft, 'food'>, value: string) => {
    if (this.snapshot.saving || this.snapshot.draft[field] === value) return;
    this.pending = undefined;
    const draft = { ...this.snapshot.draft, [field]: value };
    if (field === 'search') {
      draft.food = null;
      clearTimeout(this.timer); this.searchVersion++;
      this.publish({ draft, results: [], cursor: null, searchStatus: value.trim() ? 'loading' : 'idle', errors: {}, error: null });
      if (value.trim()) this.timer = setTimeout(() => { void this.search(); }, 300);
    } else this.publish({ draft, errors: {}, error: null });
  };
  select = (food: CatalogChoice) => {
    if (this.snapshot.saving) return;
    this.assertIdentity();
    clearTimeout(this.timer); this.searchVersion++; this.pending = undefined;
    const unit = toMobileUnit(food.defaultUnit);
    this.publish({ draft: { ...this.snapshot.draft, food, unit: unit.supported ? unit.value : '' }, results: [], cursor: null, searchStatus: 'idle', errors: {}, error: null });
  };
  search = async (more = false) => {
    clearTimeout(this.timer);
    const text = this.snapshot.draft.search.trim();
    if (!text || this.snapshot.draft.food || this.snapshot.saving) return;
    const after = more ? this.snapshot.cursor : null;
    if (more && !after) return;
    const version = ++this.searchVersion;
    this.publish({ searchStatus: 'loading' });
    try {
      this.assertIdentity();
      const data = await this.auth.authenticatedGraphql<{ foods: { nodes: CatalogChoice[]; hasNextPage: boolean; endCursor: string | null } }>(addFoodOperations.search, { search: text, after });
      this.assertIdentity();
      if (version !== this.searchVersion) return;
      const page = data.foods;
      if (!page || !Array.isArray(page.nodes) || (page.hasNextPage && (!page.endCursor || page.endCursor === after))) throw new Error('Invalid catalog response.');
      this.publish({ results: more ? [...this.snapshot.results, ...page.nodes] : page.nodes, cursor: page.hasNextPage ? page.endCursor : null, searchStatus: 'ready' });
    } catch {
      if (!this.disposed && version === this.searchVersion) this.publish({ searchStatus: 'error' });
    }
  };
  submit = async (): Promise<boolean> => {
    if (this.snapshot.saving) return false;
    const draft = this.snapshot.draft, errors: AddFoodErrors = {};
    let amount = '';
    if (!draft.food) errors.food = 'required';
    try { amount = addFoodQuantity(draft.quantity); } catch { errors.quantity = 'quantity'; }
    const unit = toBackendUnit(draft.unit as UnitId), storage = toBackendStorage(draft.storage);
    if (!unit.supported) errors.unit = 'required';
    if (!storage.supported) errors.storage = 'required';
    for (const field of ['purchaseDate', 'expiryDay'] as const) {
      if (draft[field] && !isCalendarDate(draft[field])) errors[field] = 'date';
    }
    if (isCalendarDate(draft.purchaseDate) && isCalendarDate(draft.expiryDay) && draft.expiryDay < draft.purchaseDate) errors.expiryDay = 'dateOrder';
    this.publish({ errors, error: null });
    if (Object.keys(errors).length || !draft.food || !unit.supported || !storage.supported) return false;
    this.publish({ saving: true });
    try {
      this.assertIdentity();
      const household = await resolveActiveHousehold(this.auth, this.storage);
      this.assertIdentity();
      if (this.pending && (this.pending.householdId !== household.id || this.pending.timezone !== household.timezone
        || this.pending.householdRevision !== getActiveHouseholdRevision(this.auth))) {
        this.pending = undefined;
        throw new Error('Your active household changed. Review the form and save again.');
      }
      if (!this.pending) {
        const input: BackendAddStockInput = {
          foodId: draft.food.id, amount, unit: unit.value, storageLocation: storage.value,
          ...(draft.purchaseDate ? { purchaseDate: draft.purchaseDate } : {}),
          ...(draft.expiryDay ? { estimatedExpiryAt: inventoryEndOfDay(draft.expiryDay, household.timezone) } : {}),
          idempotencyKey: this.key(),
        };
        this.pending = { input: Object.freeze(input), householdId: household.id, timezone: household.timezone, householdRevision: getActiveHouseholdRevision(this.auth) };
      }
      const attempt = this.pending;
      const data = await this.auth.authenticatedGraphql<{ addStock: BackendAddStockResult }>(addFoodOperations.add, { input: attempt.input }, attempt.householdId);
      this.assertIdentity();
      const current = await resolveActiveHousehold(this.auth, this.storage);
      this.assertIdentity();
      if (current.id !== attempt.householdId || current.timezone !== attempt.timezone || attempt.householdRevision !== getActiveHouseholdRevision(this.auth)) throw new Error('Your active household changed. Reopen Kitchen.');
      if (data.addStock?.__typename !== 'InventoryMutationSuccessType') throw new Error('The backend did not confirm the addition.');
      this.pending = undefined;
      clearTimeout(this.timer); this.searchVersion++;
      this.publish({ draft: emptyDraft(), results: [], cursor: null, searchStatus: 'idle', errors: {} });
      return true;
    } catch (error) {
      if (!this.disposed) this.publish({ error });
      return false;
    } finally { if (!this.disposed) this.publish({ saving: false }); }
  };
}
