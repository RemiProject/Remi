import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackendKitchenStore, visibleBackendKitchen } from '@/repositories/backend-kitchen-store';
import { createGraphqlInventoryRepository, InventoryReadError } from '@/repositories/graphql-inventory-repository';
import { inventoryExpiryDay } from '@/domain/backend-inventory-read-model';
import { getActiveHouseholdRevision, resolveActiveHousehold, subscribeHouseholdSelection } from '@/services/active-household-service';
import { getAuth } from '@/services/auth';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
import { loadInventoryArabicNames } from '@/services/inventory-catalog-names';
import type { InventoryReadItem } from '@/domain/backend-inventory-read-model';
import { connectivity } from '@/services/connectivity';
import { offlineCache } from '@/services/offline-cache';
import { useAuth } from './auth-provider';

const Context = createContext<BackendKitchenStore | null>(null);
export function BackendKitchenProvider({ children }: PropsWithChildren) {
  return isBackendInventoryEnabled() ? <EnabledBackendKitchenProvider>{children}</EnabledBackendKitchenProvider> : children;
}
function EnabledBackendKitchenProvider({ children }: PropsWithChildren) {
  const { user, busy, ready } = useAuth();
  const timezone = useRef<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const [store] = useState(() => new BackendKitchenStore(() => {
    const auth = getAuth();
    const repository = createGraphqlInventoryRepository(auth, AsyncStorage)!;
    async function readWithNames<T extends InventoryReadItem>(read: () => Promise<T[]>) {
      const household = await resolveActiveHousehold(auth, AsyncStorage);
      const revision = getActiveHouseholdRevision(auth);
      const identity = auth.getIdentityRevision();
      const items = await read();
      const names = await loadInventoryArabicNames(auth, items.map(item => item.foodId));
      const current = await resolveActiveHousehold(auth, AsyncStorage);
      if (revision !== getActiveHouseholdRevision(auth) || identity !== auth.getIdentityRevision() || current.id !== household.id) {
        throw new InventoryReadError('STALE_CONTEXT', 'Your account or active household changed. Please reload.');
      }
      return { household, items: items.map(item => ({ ...item, ...(names.has(item.foodId) ? { arabicName: names.get(item.foodId)! } : {}) })) };
    }
    return {
      async get(id) {
        const { items } = await readWithNames(async () => [await repository.get(id)]);
        return items[0];
      },
      async list() {
        const userId = ownerRef.current;
        try {
          const { items, household } = await readWithNames(repository.list);
          timezone.current = household.timezone;
          if (userId) offlineCache.write(userId, 'kitchen', { timezone: household.timezone, items });
          return { items, today: inventoryExpiryDay(new Date().toISOString(), household.timezone)! };
        } catch (error) {
          // Offline: the kitchen as last loaded. Changes still need the server, so they fail with a clear message.
          const saved = userId && connectivity.isOffline() ? await offlineCache.read<{ timezone: string; items: InventoryReadItem[] }>(userId, 'kitchen') : null;
          if (!saved) throw error;
          timezone.current = saved.timezone;
          return { items: saved.items, today: inventoryExpiryDay(new Date().toISOString(), saved.timezone)! };
        }
      },
    };
  }));
  const owner = ready && !busy ? user?.id ?? null : null;
  useEffect(() => { ownerRef.current = owner; timezone.current = null; store.setUser(owner); }, [store, owner]);
  useEffect(() => subscribeHouseholdSelection(() => {
    timezone.current = null;
    store.setUser(null);
    store.setUser(owner);
  }), [store, owner]);
  useEffect(() => {
    const refresh = () => { if (owner) void store.reload(); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    // Advance date-only urgency without refetching the entire inventory each minute.
    const timer = setInterval(() => {
      if (owner && timezone.current) store.updateToday(inventoryExpiryDay(new Date().toISOString(), timezone.current)!);
    }, 60000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [store, owner]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useBackendKitchen() {
  const store = useContext(Context);
  if (!store) throw new Error('Backend kitchen is not enabled.');
  const auth = useAuth();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const restoreFailed = auth.ready && !auth.busy && !auth.user
    && (auth.error === 'connectionError' || auth.error === 'storageError');
  return {
    ...visibleBackendKitchen(snapshot, auth.user?.id ?? null, auth.busy || !auth.ready),
    ...(restoreFailed ? { status: 'error' as const } : {}),
    retry: restoreFailed ? auth.restore : store.reload, loadDetail: store.loadDetail,
    showAdded: store.showAdded, dismissAdded: store.dismissAdded,
    refreshAfterMeal: store.refreshAfterMeal, refreshStock: store.refreshStock, showUpdated: store.showUpdated,
  };
}
