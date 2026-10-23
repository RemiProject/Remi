import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthAction, AuthInput, AuthLink, AuthNotice, AuthShell } from '@/components/auth-ui';
import { useLanguage } from '@/providers/language-provider';
import { authMessages } from '@/i18n/auth';
import { getAuth } from '@/services/auth';
import { passwordRules } from '@/services/auth-form';
import { authErrorKey } from '@/services/auth-validation';
import { useAuth } from '@/providers/auth-provider';

export default function PasswordResetScreen({ reset = false }: { reset?: boolean }) {
  const { language } = useLanguage();
  const t = authMessages[language];
  const auth = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    if (!reset && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254)) { setError('emailInvalid'); return; }
    if (reset) {
      if (!token || Array.isArray(token)) { setError('resetExpired'); return; }
      if (!Object.values(passwordRules(password)).every(Boolean)) { setError('passwordSignup'); return; }
      if (password !== confirmation) { setError('passwordMismatch'); return; }
    }
    pending.current = true; setBusy(true); setError(null);
    try {
      if (reset) {
        await getAuth().resetPassword(token!, password);
        await auth.restore();
      }
      else await getAuth().requestPasswordReset(email.trim());
      setDone(true);
      if (reset) router.setParams({ token: undefined });
    } catch (e) { setError(authErrorKey(e)); }
    finally { setPassword(''); setConfirmation(''); setBusy(false); pending.current = false; }
  }
  return <AuthShell title={reset ? t.resetTitle : t.forgotTitle} subtitle={reset ? t.resetIntro : t.forgotIntro} onBack={() => router.replace('/login')}>
    {done ? <><AuthNotice success>{reset ? t.resetDone : t.resetSent}</AuthNotice><AuthAction label={t.login} onPress={() => router.replace('/login')} /></> : <>
      {reset ? <>
        <AuthInput label={t.password} value={password} password editable={!busy} autoComplete="new-password" maxLength={128} onChangeText={setPassword} />
        <AuthInput label={t.confirmPassword} value={confirmation} password editable={!busy} autoComplete="new-password" maxLength={128} onChangeText={setConfirmation} />
      </> : <AuthInput label={t.email} value={email} editable={!busy} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} placeholder="you@example.com" onChangeText={setEmail} />}
      {error && <AuthNotice>{t[error]}</AuthNotice>}
      <AuthAction label={busy ? t.wait : reset ? t.resetAction : t.sendReset} disabled={busy} busy={busy} onPress={() => { void submit(); }} />
      {reset && <AuthLink label={t.forgotPassword} onPress={() => router.replace('/forgot-password')} />}
    </>}
  </AuthShell>;
}
