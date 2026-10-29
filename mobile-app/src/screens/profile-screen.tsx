import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, PageHeader, Screen } from '@/components/ui/core';
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
    <AppText muted>{isBackendInventoryEnabled() ? t.backendKitchen : t.local}</AppText>
  </Screen></SafeAreaView>;
}
