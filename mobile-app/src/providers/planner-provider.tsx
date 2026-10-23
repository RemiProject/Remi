import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlannerStore } from '@/repositories/planner-store';
const PlannerContext = createContext<PlannerStore | null>(null);
export function PlannerProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new PlannerStore(AsyncStorage));
  useEffect(() => { void store.hydrate(); }, [store]);
  return <PlannerContext.Provider value={store}>{children}</PlannerContext.Provider>;
}
export function usePlanner() {
  const store = useContext(PlannerContext);
  if (!store) throw new Error('usePlanner requires PlannerProvider');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, retry: store.hydrate, add: store.add, remove: store.remove };
}
