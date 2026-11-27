import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthAction, AuthInput, AuthLink, AuthNotice, AuthShell } from '@/components/auth-ui';
import { useLanguage } from '@/providers/language-provider';
import { authMessages } from '@/i18n/auth';
import { getAuth } from '@/services/auth';
import { passwordRules } from '@/services/auth-form';
import { authErrorKey } from '@/services/auth-validation';
import { useAuth } from '@/providers/auth-provider';

/** /reset-password?token=...: completes a reset from the emailed link. The code flow is forgot-password-screen.tsx. */
export default function PasswordResetScreen() {
  const { language } = useLanguage();
  const t = authMessages[language];
  const auth = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    if (!token || Array.isArray(token)) { setError('resetExpired'); return; }
    if (!Object.values(passwordRules(password)).every(Boolean)) { setError('passwordSignup'); return; }
    if (password !== confirmation) { setError('passwordMismatch'); return; }
    pending.current = true; setBusy(true); setError(null);
    try {
      await getAuth().resetPassword(token, password);
      await auth.restore();
      setDone(true);
      router.setParams({ token: undefined });
    } catch (e) { setError(authErrorKey(e)); }
    finally { setPassword(''); setConfirmation(''); setBusy(false); pending.current = false; }
  }
  return <AuthShell title={t.resetTitle} subtitle={t.resetIntro} onBack={() => router.replace('/login')}>
    {done ? <><AuthNotice success>{t.resetDone}</AuthNotice><AuthAction label={t.login} onPress={() => router.replace('/login')} /></> : <>
      <AuthInput label={t.password} value={password} password editable={!busy} autoComplete="new-password" maxLength={128} onChangeText={setPassword} />
      <AuthInput label={t.confirmPassword} value={confirmation} password editable={!busy} autoComplete="new-password" maxLength={128} onChangeText={setConfirmation} />
      {error && <AuthNotice>{t[error]}</AuthNotice>}
      <AuthAction label={busy ? t.wait : t.resetAction} disabled={busy} busy={busy} onPress={() => { void submit(); }} />
      <AuthLink label={t.forgotPassword} onPress={() => router.replace('/forgot-password')} />
    </>}
  </AuthShell>;
}
