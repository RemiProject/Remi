import type { BackendUnit } from '../domain/backend-inventory';
import type { BackendRecipe } from '../domain/backend-recipes';
import { mealRowAmount, scaleMealAmount, type MealRow, type MealType } from '../domain/cooked-it';
import { addFoodQuantity } from './backend-add-food';
import { getActiveHouseholdRevision, resolveActiveHousehold, type ActiveHouseholdStorage } from './active-household-service';
import type { createAuthService } from './auth-service';
import { isBackendInventoryEnabled } from './inventory-feature';

export const logCookedMealOperation = `mutation LogCookedMeal($input:LogMealInputType!) { logMeal(input:$input) {
  __typename ... on MealLogSuccessType { replayed meals { id userId } }
  ... on InsufficientStockType { foodId available requested unit }
} }`;
type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql' | 'getIdentityContext' | 'getIdentityRevision'>;
interface MealInput { mealType: MealType; origin: 'HOME'; eatenAt: string; name: string; skipExpiredBatches: true; idempotencyKey: string; items: { foodId: string; amount: string; unit: BackendUnit }[] }
interface Context { householdId: string; revision: number; timezone: string }
interface Snapshot { rows: MealRow[]; servings: string; mealType: MealType; saving: boolean; refreshPending: boolean;
  error: unknown | null; validation: string[]; insufficient: { foodId: string | null; available: string; unit: BackendUnit } | null }
let sequence = 0;
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `mobile-meal-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export class CookedMealStore {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private readonly identity: number;
  private readonly householdRevision: number;
  private disposed = false;
  private done = false;
  private lastServings: string;
  private pending?: { context: Context; input: MealInput; confirmed: boolean };
  constructor(private readonly auth: Auth, private readonly storage: ActiveHouseholdStorage, private readonly recipe: BackendRecipe,
    rows: MealRow[], mealType: MealType, private readonly refresh: () => Promise<void>, private readonly completed: () => void,
    private readonly key = newKey, private readonly now = () => new Date()) {
    this.lastServings = String(recipe.servings);
    this.identity = auth.getIdentityRevision(); this.householdRevision = getActiveHouseholdRevision(auth);
    this.snapshot = { rows, servings: String(recipe.servings), mealType, saving: false, refreshPending: false, error: null, validation: [], insufficient: null };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  activate = () => { this.disposed = false; };
  dispose = () => { this.disposed = true; };
  private publish(update: Partial<Snapshot>) { if (!this.disposed) { this.snapshot = { ...this.snapshot, ...update }; this.listeners.forEach(l => l()); } }
  private assertContext(context?: Context) {
    if (this.auth.getIdentityRevision() !== this.identity || getActiveHouseholdRevision(this.auth) !== (context?.revision ?? this.householdRevision)) throw new Error('STALE_CONTEXT');
  }
  private async context(): Promise<Context> {
    this.assertContext(); const household = await resolveActiveHousehold(this.auth, this.storage); this.assertContext();
    return { householdId: household.id, timezone: household.timezone, revision: getActiveHouseholdRevision(this.auth) };
  }
  private async revalidate(context: Context) {
    this.assertContext(context); const current = await this.context();
    if (context.householdId !== current.householdId || context.timezone !== current.timezone) throw new Error('STALE_CONTEXT');
  }
  change = (field: 'servings' | 'mealType' | 'amount' | 'checked', value: string | boolean, id?: string) => {
    if (this.disposed || this.snapshot.saving || this.snapshot.refreshPending) return;
    this.pending = undefined;
    let rows = this.snapshot.rows;
    let validation: string[] = [];
    if (field === 'servings') {
      try {
        const servings = addFoodQuantity(String(value));
        rows = rows.map(row => {
          if (row.status !== 'UNKNOWN') return { ...row, amount: mealRowAmount(row, this.recipe.servings, servings) };
          try { return { ...row, amount: row.amount.trim() ? scaleMealAmount(addFoodQuantity(row.amount), this.lastServings, servings) : '' }; }
          catch { return row; }
        });
        this.lastServings = servings;
      } catch { validation = ['servings']; }
    } else if (field === 'amount' || field === 'checked') rows = rows.map(row => row.id === id ? { ...row, [field]: value } as MealRow : row);
    this.publish({ rows, ...(field === 'servings' ? { servings: String(value) } : field === 'mealType' ? { mealType: value as MealType } : {}), error: null, validation, insufficient: null });
  };
  submit = async (): Promise<boolean> => {
    if (this.snapshot.saving || this.disposed || this.done || !isBackendInventoryEnabled()) return false;
    this.publish({ saving: true, error: null, insufficient: null, validation: [] });
    try {
      let items: MealInput['items'] = [];
      if (!this.pending?.confirmed) {
        const validation: string[] = [];
        try { if (addFoodQuantity(this.snapshot.servings) !== addFoodQuantity(this.lastServings)) throw new Error('Invalid scaled amounts'); } catch { validation.push('servings'); }
        const checked = this.snapshot.rows.filter(row => row.checked);
        if (!checked.length) validation.push('items');
        for (const row of checked) { try { items.push({ foodId: row.foodId, amount: addFoodQuantity(row.amount), unit: row.unit }); } catch { validation.push(row.id); } }
        if (validation.length) { this.publish({ validation }); return false; }
      }
      const context = await this.context();
      if (this.pending) await this.revalidate(this.pending.context);
      else this.pending = { context, input: { mealType: this.snapshot.mealType, origin: 'HOME', name: this.recipe.name,
        eatenAt: this.now().toISOString(), skipExpiredBatches: true, items, idempotencyKey: this.key() }, confirmed: false };
      const attempt = this.pending;
      if (!attempt.confirmed) {
        const response = await this.auth.authenticatedGraphql<{ logMeal: { __typename: string; replayed?: boolean; meals?: { id: string; userId: string }[]; foodId?: string | null; available?: string; unit?: BackendUnit } }>(logCookedMealOperation, { input: attempt.input }, attempt.context.householdId);
        await this.revalidate(attempt.context);
        const result = response.logMeal;
        if (result?.__typename === 'InsufficientStockType' && result.available !== undefined && result.unit) {
          this.publish({ insufficient: { foodId: result.foodId ?? null, available: result.available, unit: result.unit } }); return false;
        }
        const identity = await this.auth.getIdentityContext(); this.assertContext(attempt.context);
        if (result?.__typename !== 'MealLogSuccessType' || result.meals?.length !== 1 || result.meals[0].userId !== identity.userId) throw new Error('The backend did not confirm this meal.');
        attempt.confirmed = true; this.publish({ refreshPending: true });
      }
      await this.refresh(); await this.revalidate(attempt.context);
      if (!this.disposed) { this.pending = undefined; this.done = true; this.publish({ refreshPending: false }); this.completed(); }
      return true;
    } catch (error) { this.publish({ error }); return false; }
    finally { this.publish({ saving: false }); }
  };
}

/** Keep one draft alive while post-save refresh changes provider loading states. */
export class CookedMealPreparation {
  private snapshot: { store: CookedMealStore | null; error: unknown | null } = { store: null, error: null };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  prepare = (factory: () => CookedMealStore) => {
    if (this.snapshot.store || this.snapshot.error) return;
    try { this.snapshot = { store: factory(), error: null }; }
    catch (error) { this.snapshot = { store: null, error }; }
    this.listeners.forEach(listener => listener());
  };
  retry = () => { this.snapshot = { store: null, error: null }; this.listeners.forEach(listener => listener()); };
}
