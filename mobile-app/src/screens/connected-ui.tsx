import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, Card, EmptyState, PageHeader, Screen } from '@/components/ui/core';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getAuth } from '@/services/auth';
import { getActiveHouseholdRevision, subscribeHouseholdSelection } from '@/services/active-household-service';
import { errorMessage } from '@/services/kitchen-api';

export function useKitchenIdentity() {
  const { user } = useAuth(); const auth = getAuth();
  const householdRevision = useSyncExternalStore(subscribeHouseholdSelection, () => getActiveHouseholdRevision(auth), () => 0);
  return `${user?.id}:${auth.getIdentityRevision()}:${householdRevision}`;
}
export function useCopy() { const { language } = useLanguage(); return (english: string, arabic: string) => language === 'ar' ? arabic : english; }
export function ConnectedScreen({ title, children, footer, back = true }: PropsWithChildren<{ title: string; footer?: React.ReactNode; back?: boolean }>) {
  const { user, ready, busy } = useAuth(); const { language } = useLanguage(); const copy = useCopy();
  return <SafeAreaView edges={back ? ['top','bottom'] : []} style={{ flex: 1 }}><Screen footer={user ? footer : undefined} rtl={language === 'ar'}><PageHeader title={title} action={back ? <Button label={copy('Back', 'رجوع')} variant="text" icon="back" rtl={language === 'ar'} onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} /> : undefined} />
    {!ready || busy ? <AppText>{copy('Loading your account…', 'جارٍ تحميل حسابك…')}</AppText> : !user ? <EmptyState title={copy('Your kitchen, together', 'مطبخك في مكان واحد')} description={copy('Sign in to sync recipes, plans and shopping with your household.', 'سجّل الدخول لمزامنة الوصفات والخطط والمشتريات مع أسرتك.')} action={copy('Sign in', 'تسجيل الدخول')} onPress={() => router.push('/login')} /> : children}</Screen></SafeAreaView>;
}
export function useKitchenData<T>(loader: () => Promise<T>) {
  const { user, ready, busy } = useAuth(); const revision = getAuth().getIdentityRevision();
  const [householdRevision, setHouseholdRevision] = useState(() => getActiveHouseholdRevision(getAuth()));
  useEffect(() => subscribeHouseholdSelection(() => setHouseholdRevision(getActiveHouseholdRevision(getAuth()))), []);
  const owner = user && ready && !busy ? `${user.id}:${revision}:${householdRevision}` : null;
  const [state, setState] = useState<{ owner: string | null; data: T | null; error: string | null; loading: boolean }>({ owner: null, data: null, error: null, loading: false });
  const generation = useRef(0); const loaderRef = useRef(loader); loaderRef.current = loader;
  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (!owner) { setState({ owner: null, data: null, error: null, loading: false }); return; }
    setState(current => ({ owner, data: current.owner === owner ? current.data : null, error: null, loading: true }));
    try { const data = await loaderRef.current(); if (request === generation.current && revision === getAuth().getIdentityRevision()) setState({ owner, data, error: null, loading: false }); }
    catch (error) { if (request === generation.current) setState(current => ({ ...current, owner, error: errorMessage(error), loading: false })); }
  }, [owner, revision]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current++; }; }, [reload]));
  return { data: owner && state.owner === owner ? state.data : null, error: owner && state.owner === owner ? state.error : null, loading: !!owner && (state.owner !== owner || state.loading), reload };
}
export function DataNotice({ loading, error, reload }: { loading: boolean; error: string | null; reload: () => Promise<void> }) {
  const copy = useCopy();
  return error ? <Card><AppText accessibilityRole="alert">{error}</AppText><Button label={copy('Try again', 'حاول مجددًا')} onPress={() => { void reload(); }} /></Card> : loading ? <AppText accessibilityLiveRegion="polite" muted>{copy('Loading…', 'جارٍ التحميل…')}</AppText> : null;
}
export function useAction(reload?: () => Promise<void>) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const lock = useRef(false);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (lock.current) return false; lock.current = true; setBusy(true); setMessage(null); const revision = getAuth().getIdentityRevision();
    try { await action(); if (revision !== getAuth().getIdentityRevision()) return false; await reload?.(); setMessage(success ?? null); return true; }
    catch (error) { if (revision === getAuth().getIdentityRevision()) setMessage(errorMessage(error)); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, message, run, clear: () => setMessage(null) };
}
export function Feedback({ message }: { message: string | null }) { return message ? <View><AppText accessibilityLiveRegion="polite">{message}</AppText></View> : null; }
