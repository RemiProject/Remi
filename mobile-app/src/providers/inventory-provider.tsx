import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { inventoryRepository } from '@/repositories/async-storage-inventory-repository';
import { InventoryStore } from '@/repositories/inventory-store';
import { localDateKey } from '@/domain/inventory';
import { photoStorage } from '@/services/photo-storage';

const InventoryContext = createContext<{ store: InventoryStore; today: string } | null>(null);
export function InventoryProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new InventoryStore(inventoryRepository, photoStorage));
  const [today, setToday] = useState(localDateKey);
  useEffect(() => {
    void store.hydrate();
    const refresh = () => setToday(localDateKey());
    const interval = setInterval(refresh, 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [store]);
  return <InventoryContext.Provider value={{ store, today }}>{children}</InventoryContext.Provider>;
}
export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory requires InventoryProvider');
  const { store } = context;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, retryRead: store.hydrate, createItem: store.create, updateItem: store.update, deleteItem: store.delete };
}
// One shared clock refreshes date-only urgency at midnight/resume for all screens/cards.
export function useToday() {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useToday requires InventoryProvider');
  return context.today;
}
