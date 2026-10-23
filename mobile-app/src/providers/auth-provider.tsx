import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { AuthStore } from '@/repositories/auth-store';
import { getAuth } from '@/services/auth';

const Context = createContext<AuthStore | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new AuthStore(getAuth));
  useEffect(() => {
    void store.restore();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void store.restore(); });
    return () => subscription.remove();
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useAuth() {
  const store = useContext(Context);
  if (!store) throw new Error('useAuth requires AuthProvider');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, login: store.login, logout: store.logout, restore: store.restore };
}
