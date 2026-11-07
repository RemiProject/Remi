import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, PageHeader, Screen } from '@/components/ui/core';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
export function IntakeShell({ title, children }: PropsWithChildren<{ title: string }>) {
  const { user, ready, busy } = useAuth();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={language === 'ar'}>
    <PageHeader title={title} action={<Button label={language === 'ar' ? 'رجوع' : 'Back'} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />} />
    {!ready || busy ? <AppText>{language === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</AppText> : !user ? <EmptyState title={language === 'ar' ? 'سجّل الدخول إلى مطبخك' : 'Sign in to your kitchen'} description={language === 'ar' ? 'تُحفظ هذه المعلومات في حساب أسرتك.' : 'This information is saved with your household account.'} action={language === 'ar' ? 'تسجيل الدخول' : 'Sign in'} onPress={() => router.push('/login')} /> : children}
  </Screen></SafeAreaView>;
}
export function intakeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not complete this action. Check your connection and try again.';
}
