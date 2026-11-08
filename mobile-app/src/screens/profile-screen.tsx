import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { authMessages } from '@/i18n/auth';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';

export default function ProfileScreen() {
  const auth = useAuth();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = authMessages[language];
  const rtl = language === 'ar';
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={rtl}>
    <Button label={t.backMore} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />
    <PageHeader title={t.profile} />
    {!auth.ready ? <AppText>{t.restoring}</AppText> : auth.user ? <Card>
      <AppText variant="heading">{auth.user.name}</AppText><AppText>{auth.user.email}</AppText>
      <AppText muted>{auth.user.emailVerifiedAt ? t.signedIn : t.verificationPending}</AppText>
      <Button label={auth.busy ? t.wait : t.logout} disabled={auth.busy} onPress={() => { void auth.logout(); }} />
    </Card> : <Card>
      <AppText>{t.intro}</AppText>
      <Button label={t.login} disabled={auth.busy} onPress={() => router.push('/login')} />
      <Button label={t.signup} variant="secondary" disabled={auth.busy} onPress={() => router.push('/signup')} />
    </Card>}
    {auth.error && <Card><AppText accessibilityRole="alert">{t[auth.error]}</AppText>
      <Button label={auth.error === 'logoutError' ? t.logout : t.retry} disabled={auth.busy}
        onPress={() => { void (auth.error === 'logoutError' ? auth.logout() : auth.restore()); }} variant="secondary" />
    </Card>}
    {auth.user && <Card><Button label={rtl ? 'الأسرة والدعوات' : 'Household & invitations'} icon="community" variant="secondary" onPress={() => router.push({ pathname: '/feature', params: { feature: 'community' } })} /><Button label={rtl ? 'التغذية والتفضيلات' : 'Nutrition & preferences'} icon="health" variant="secondary" onPress={() => router.push({ pathname: '/feature', params: { feature: 'health' } })} /></Card>}
    <AppText muted>{isBackendInventoryEnabled() ? t.backendKitchen : t.local}</AppText>
    {auth.user && <DeleteAccount t={t} busy={auth.busy} onDelete={auth.deleteAccount} />}
  </Screen></SafeAreaView>;
}

/** Closed by default: one quiet text button, then the password and a last native confirmation (App Store guideline 5.1.1(v)). */
function DeleteAccount({ t, busy, onDelete }: { t: Record<string, string>; busy: boolean; onDelete: (password: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button label={t.deleteAccount} variant="dangerText" onPress={() => setOpen(true)} />;
  const confirm = () => Alert.alert(t.deleteSureTitle, t.deleteSureBody, [
    { text: t.deleteCancel, style: 'cancel' },
    { text: t.deleteAction, style: 'destructive', onPress: () => { void onDelete(password).then(key => {
      if (key) { setError(t[key] ?? t.connectionError); return; }
      router.replace('/');
    }); } },
  ]);
  return <Card>
    <AppText variant="heading">{t.deleteAccount}</AppText>
    <AppText muted>{t.deleteIntro}</AppText>
    <FormField label={t.deleteConfirmPassword} value={password} onChangeText={value => { setPassword(value); setError(null); }} secureTextEntry
      autoCapitalize="none" autoComplete="current-password" textContentType="password" error={error ?? undefined} inputDirection="ltr" />
    <Button label={busy ? t.wait : t.deleteAction} variant="destructive" disabled={busy || !password} onPress={confirm} />
    <Button label={t.deleteCancel} variant="text" disabled={busy} onPress={() => { setOpen(false); setPassword(''); setError(null); }} />
  </Card>;
}
