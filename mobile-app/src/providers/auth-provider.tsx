import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { AuthStore } from '@/repositories/auth-store';
import { getAuth } from '@/services/auth';
import { offlineCache } from '@/services/offline-cache';

const Context = createContext<AuthStore | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => {
    const auth = new AuthStore(getAuth);
    // Signing out or deleting the account also removes the offline copies of that account's kitchen.
    const { logout, deleteAccount } = auth;
    auth.logout = async () => { await logout(); await offlineCache.clear(); };
    auth.deleteAccount = async (password) => { const key = await deleteAccount(password); if (!key) await offlineCache.clear(); return key; };
    return auth;
  });
  useEffect(() => {
    void store.restore();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void store.restore(); });
    return () => subscription.remove();
  }, [store]);
  // Keep this device's push token on the signed-in account; permission is only asked from Notifications.
  const userId = useSyncExternalStore(store.subscribe, () => store.getSnapshot().user?.id ?? null, () => null);
  useEffect(() => { if (userId) void import('@/services/push-registration').then(push => push.enablePush(false)); }, [userId]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useAuth() {
  const store = useContext(Context);
  if (!store) throw new Error('useAuth requires AuthProvider');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, login: store.login, logout: store.logout, deleteAccount: store.deleteAccount, restore: store.restore };
}
