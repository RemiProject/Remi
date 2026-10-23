import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShoppingStore } from '@/repositories/shopping-store';
const ShoppingContext = createContext<ShoppingStore | null>(null);
export function ShoppingProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new ShoppingStore(AsyncStorage));
  useEffect(() => { void store.hydrate(); }, [store]);
  return <ShoppingContext.Provider value={store}>{children}</ShoppingContext.Provider>;
}
export function useShopping() {
  const store = useContext(ShoppingContext);
  if (!store) throw new Error('useShopping requires ShoppingProvider');
  return { ...useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot), retry: store.hydrate, save: store.save, toggle: store.toggle, remove: store.remove, clearPurchased: store.clearPurchased };
}
