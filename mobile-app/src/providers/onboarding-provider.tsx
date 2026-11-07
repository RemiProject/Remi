import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingStore } from '@/repositories/onboarding-store';
const OnboardingContext = createContext<OnboardingStore | null>(null);
export function OnboardingProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new OnboardingStore(AsyncStorage));
  useEffect(() => { void store.hydrate(); }, [store]);
  return <OnboardingContext.Provider value={store}>{children}</OnboardingContext.Provider>;
}
export function useOnboarding() {
  const store = useContext(OnboardingContext);
  if (!store) throw new Error('useOnboarding requires OnboardingProvider');
  return { ...useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot), complete: store.complete };
}
