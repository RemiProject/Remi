import type { BackendAdjustStockInput, BackendInventoryItemDetail, BackendInventoryMutationResult, BackendInventoryStockInput } from '../domain/backend-inventory';
import { mapInventoryReadItem, type InventoryReadDetail, type InventoryReadItem } from '../domain/backend-inventory-read-model';
import { calculateInventoryDelta, formatDecimal, parseDecimal } from '../domain/inventory-decimal';
import { toBackendUnit } from '../domain/inventory-enum-adapters';
import type { UnitId } from '../domain/inventory';
import { inventoryReadOperations } from '../repositories/graphql-inventory-repository';
import { getActiveHouseholdRevision, resolveActiveHousehold, type ActiveHouseholdStorage } from './active-household-service';
import { addFoodQuantity } from './backend-add-food';
import type { createAuthService } from './auth-service';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql' | 'getIdentityContext' | 'getIdentityRevision'>;
export type StockAction = 'used' | 'discard' | 'fix' | 'mistake';
const resultFields = '__typename ... on InventoryMutationSuccessType { eventId replayed foodId quantity unit balances { inventoryItemId quantityDelta balanceAfter } } ... on InsufficientStockType { available unit }';
export const stockActionOperations = {
  used: `mutation UseKitchenFood($input: InventoryStockInput!) { result: consumeStock(input: $input) { ${resultFields} } }`,
  discard: `mutation DiscardKitchenFood($input: InventoryStockInput!) { result: discardStock(input: $input) { ${resultFields} } }`,
  fix: `mutation FixKitchenCount($input: InventoryAdjustmentInput!) { result: adjustStock(input: $input) { ${resultFields} } }`,
  mistake: `mutation RemoveMistakenBatch($input: InventoryAdjustmentInput!) { result: adjustStock(input: $input) { ${resultFields} } }`,
};
export class StockActionError extends Error {
  constructor(readonly code: 'STALE_CONTEXT' | 'READ_ONLY' | 'INVALID_RESPONSE', message: string) { super(message); }
}
// Correct totals are balances, so zero is valid. Used/discard amounts use addFoodQuantity.
export function stockTotal(text: string): string {
  const normalized = text.trim().replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  }).replace(/[,٫]/g, '.');
  return formatDecimal(parseDecimal(normalized));
}
interface Snapshot {
  action: StockAction | null; input: string; unit: UnitId | null;
  saving: boolean; refreshPending: boolean; validation: boolean; unchanged: boolean;
  error: unknown | null;
  insufficient: Extract<BackendInventoryMutationResult, { __typename: 'InsufficientStockType' }> | null;
}
interface Context { householdId: string; timezone: string; revision: number }
interface Attempt extends Context {
  action: StockAction; input: Readonly<BackendInventoryStockInput | BackendAdjustStockInput>; confirmed: boolean;
}
let sequence = 0;
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `mobile-stock-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** A pending attempt keeps its delta, payload and key, even if a timed-out write actually committed. */
export class BackendStockActionsStore {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private readonly identity: number;
  private householdRevision: number | null;
  private disposed = false;
  private pending?: Attempt;
  constructor(private readonly auth: Auth, private readonly storage: ActiveHouseholdStorage,
    private item: InventoryReadItem,
    private readonly refresh: () => Promise<InventoryReadDetail>,
    private readonly updated: (zero: boolean) => void,
    private readonly key = newKey) {
    this.identity = auth.getIdentityRevision();
    this.householdRevision = getActiveHouseholdRevision(auth) || null;
    this.snapshot = { action: null, input: '', unit: item.unitId, saving: false, refreshPending: false, validation: false, unchanged: false, error: null, insufficient: null };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach(listener => listener());
  }
  activate = () => { this.disposed = false; };
  dispose = () => { this.disposed = true; };
  private assertIdentity() {
    if (this.disposed || this.identity !== this.auth.getIdentityRevision()) throw new StockActionError('STALE_CONTEXT', 'Your account changed. Reopen Kitchen.');
    if (this.householdRevision !== null && this.householdRevision !== getActiveHouseholdRevision(this.auth)) throw new StockActionError('STALE_CONTEXT', 'Your household changed. Reopen Kitchen.');
  }
  private assertContext(context: Context) {
    this.assertIdentity();
    if (context.revision !== getActiveHouseholdRevision(this.auth)) throw new StockActionError('STALE_CONTEXT', 'Your household changed. Reopen Kitchen.');
  }
  private async context(): Promise<Context> {
    this.assertIdentity();
    const household = await resolveActiveHousehold(this.auth, this.storage);
    this.assertIdentity();
    this.householdRevision ??= getActiveHouseholdRevision(this.auth);
    return { householdId: household.id, timezone: household.timezone, revision: getActiveHouseholdRevision(this.auth) };
  }
  private async revalidate(context: Context) {
    this.assertContext(context);
    const current = await this.context();
    this.assertContext(context);
    if (current.householdId !== context.householdId || current.timezone !== context.timezone) throw new StockActionError('STALE_CONTEXT', 'Your household changed. Reopen Kitchen.');
  }
  open = (action: StockAction, item = this.item) => {
    if (this.snapshot.saving || this.snapshot.refreshPending || item.readOnly || item.id !== this.item.id) return;
    this.assertIdentity(); this.item = item; this.pending = undefined;
    this.publish({ action, input: action === 'fix' ? item.quantity : '', unit: item.unitId, error: null, insufficient: null, validation: false, unchanged: false });
  };
  cancel = () => {
    if (this.snapshot.saving || this.snapshot.refreshPending) return;
    this.pending = undefined; this.publish({ action: null, error: null, insufficient: null, validation: false, unchanged: false });
  };
  change = (field: 'input' | 'unit', value: string) => {
    if (this.snapshot.saving || this.snapshot.refreshPending || this.snapshot[field] === value) return;
    this.pending = undefined;
    this.publish({ [field]: value, error: null, insufficient: null, validation: false, unchanged: false });
  };
  submit = async (confirmedMistake = false): Promise<boolean> => {
    const { action, unit, input } = this.snapshot;
    if (!action || this.snapshot.saving || (action === 'mistake' && !confirmedMistake && !this.pending)) return false;
    if (this.item.readOnly) { this.publish({ error: new StockActionError('READ_ONLY', 'This batch is read-only.') }); return false; }
    let amount = '';
    const backendUnit = unit ? toBackendUnit(unit) : null;
    if (!this.pending?.confirmed) {
      try {
        amount = action === 'mistake' ? '0.000' : action === 'fix' ? stockTotal(input) : addFoodQuantity(input);
        if ((action === 'used' || action === 'discard') && !backendUnit?.supported) throw new Error('Choose a supported unit.');
      } catch { this.publish({ validation: true }); return false; }
    }
    this.publish({ saving: true, error: null, insufficient: null, validation: false, unchanged: false });
    try {
      const context = await this.context();
      if (this.pending) {
        if (this.pending.householdId !== context.householdId || this.pending.timezone !== context.timezone || this.pending.revision !== context.revision) throw new StockActionError('STALE_CONTEXT', 'Your household changed. Reopen Kitchen.');
      } else {
        let payload: BackendInventoryStockInput | BackendAdjustStockInput;
        if (action === 'fix' || action === 'mistake') {
          // Fetch only for a new operation. A retry must replay the original delta.
          const data = await this.auth.authenticatedGraphql<{ inventoryItem: BackendInventoryItemDetail }>(inventoryReadOperations.get, { id: this.item.id }, context.householdId);
          await this.revalidate(context);
          if (!data.inventoryItem || data.inventoryItem.id !== this.item.id || data.inventoryItem.foodId !== this.item.foodId) throw new StockActionError('INVALID_RESPONSE', 'Invalid inventory batch.');
          const latest = mapInventoryReadItem(data.inventoryItem, context.timezone);
          if (latest.readOnly) throw new StockActionError('READ_ONLY', 'This batch is read-only.');
          if (latest.backendUnit !== this.item.backendUnit) throw new StockActionError('STALE_CONTEXT', 'The batch unit changed. Reopen Kitchen.');
          const delta = calculateInventoryDelta(amount, latest.quantity);
          if (parseDecimal(delta, { allowNegative: true }) === 0n) { this.publish({ unchanged: true }); return false; }
          payload = { inventoryItemId: this.item.id, delta, idempotencyKey: this.key() };
        } else {
          if (!backendUnit?.supported) throw new StockActionError('READ_ONLY', 'Unsupported unit.');
          payload = { foodId: this.item.foodId, amount, unit: backendUnit.value, idempotencyKey: this.key() };
        }
        this.pending = { ...context, action, input: Object.freeze(payload), confirmed: false };
      }
      const attempt = this.pending;
      this.assertContext(attempt);
      if (!attempt.confirmed) {
        const data = await this.auth.authenticatedGraphql<{ result: BackendInventoryMutationResult }>(stockActionOperations[attempt.action], { input: attempt.input }, attempt.householdId);
        await this.revalidate(attempt);
        if (data.result?.__typename === 'InsufficientStockType') {
          parseDecimal(data.result.available);
          this.publish({ insufficient: data.result }); return false;
        }
        if (data.result?.__typename !== 'InventoryMutationSuccessType') throw new StockActionError('INVALID_RESPONSE', 'The backend did not confirm the update.');
        attempt.confirmed = true;
        this.publish({ refreshPending: true });
      }
      // Confirmed writes retry only their refresh; never dispatch another mutation.
      const latest = await this.refresh();
      await this.revalidate(attempt);
      if (latest.id !== this.item.id) throw new StockActionError('INVALID_RESPONSE', 'Invalid refreshed batch.');
      this.item = latest;
      this.updated(parseDecimal(latest.quantity) === 0n);
      this.pending = undefined;
      if (!this.disposed) this.publish({ action: null, input: '', unit: latest.unitId, refreshPending: false });
      return true;
    } catch (error) {
      if (!this.disposed) this.publish({ error });
      return false;
    } finally { if (!this.disposed) this.publish({ saving: false }); }
  };
}
