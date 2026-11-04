import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackendRecipesStore, visibleRecipes } from '@/repositories/backend-recipes-store';
import { createGraphqlRecipeRepository } from '@/repositories/graphql-recipe-repository';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
import { getActiveHouseholdRevision } from '@/services/active-household-service';
import { getAuth } from '@/services/auth';
import { useAuth } from './auth-provider';
import { useBackendKitchen } from './backend-kitchen-provider';

const Context = createContext<BackendRecipesStore | null>(null);
function ownerKey(auth: ReturnType<typeof useAuth>) {
  if (!auth.ready || auth.busy || !auth.user) return null;
  const service = getAuth();
  return `${auth.user.id}:${service.getIdentityRevision()}:${getActiveHouseholdRevision(service)}`;
}
export function BackendRecipesProvider({ children }: PropsWithChildren) {
  return isBackendInventoryEnabled() ? <Enabled>{children}</Enabled> : children;
}
function Enabled({ children }: PropsWithChildren) {
  const auth = useAuth();
  const kitchen = useBackendKitchen();
  const owner = ownerKey(auth);
  const [store] = useState(() => new BackendRecipesStore(() => createGraphqlRecipeRepository(getAuth(), AsyncStorage)!));
  useEffect(() => { store.setOwner(owner); }, [store, owner]);
  const inventoryKey = kitchen.status === 'ready' ? JSON.stringify([owner, kitchen.today, kitchen.items.map(i => [i.id, i.quantity, i.version, i.expirationDate])]) : null;
  useEffect(() => { if (inventoryKey) store.inventoryChanged(inventoryKey); }, [store, inventoryKey]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useBackendRecipes() {
  const store = useContext(Context);
  if (!store) throw new Error('Backend recipes are not enabled.');
  const auth = useAuth();
  const kitchen = useBackendKitchen();
  const owner = ownerKey(auth);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const refresh = useCallback(() => { store.setOwner(owner); return store.refresh(); }, [store, owner]);
  const loadMore = useCallback(() => { store.setOwner(owner); return store.loadMore(); }, [store, owner]);
  const loadDetail = useCallback((id: string) => { store.setOwner(owner); return store.loadDetail(id); }, [store, owner]);
  const restoreFailed = auth.ready && !auth.busy && !auth.user && (auth.error === 'connectionError' || auth.error === 'storageError');
  return { ...visibleRecipes(snapshot, owner, auth.busy || !auth.ready), ...(restoreFailed ? { status: 'error' as const } : {}),
    owner, kitchenEmpty: kitchen.status === 'ready' && kitchen.items.length === 0,
    refresh: restoreFailed ? auth.restore : refresh, loadMore, loadDetail };
}
