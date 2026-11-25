import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText } from '@/components/ui/core';
import { AuthAction, AuthInput, AuthLink, AuthNotice, AuthShell } from '@/components/auth-ui';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getBackend } from '@/services/backend';
import { isEmailAddress } from '@/services/auth-form';
import { createEmailVerificationService, type VerifyCodeFailure } from '@/services/email-verification';
import { EMAIL_CODE_LENGTH, normalizeEmailCode, parseEmailCode, resendDeadline, resendSecondsLeft } from '@/domain/email-verification';
import { authMessages } from '@/i18n/auth';
import { emailVerificationMessages } from '@/i18n/email-verification';

export interface EmailVerificationStart {
  /** Sign-up and Profile know the account's email; after a refused login it may still have to be typed. */
  origin: 'signup' | 'login' | 'profile';
  email: string;
  verified?: boolean;
}
const profile = { pathname: '/feature', params: { feature: 'profile' } } as const;
const addressKey = (email: string) => email.trim().toLowerCase();

/** The /verify-email-code route: reached after a refused login or from Profile. Sign-up shows the flow below in place. */
export default function EmailVerificationScreen() {
  const auth = useAuth();
  const { language } = useLanguage();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const t = authMessages[language];
  if (!auth.ready) return <AuthShell title={emailVerificationMessages[language].title} subtitle="" onBack={() => router.dismissTo('/login')}><AppText>{t.restoring}</AppText></AuthShell>;
  return <EmailVerificationFlow start={auth.user
    ? { origin: 'profile', email: auth.user.email, verified: !!auth.user.emailVerifiedAt }
    : { origin: 'login', email: typeof email === 'string' && isEmailAddress(email) ? email.trim() : '' }} />;
}

/**
 * `takePassword` hands over the sign-up password and forgets it at once; its owner clears it on cancel and unmount.
 * This component never stores it.
 */
export function EmailVerificationFlow({ start, takePassword, onCancel }: { start: EmailVerificationStart; takePassword?: () => string | null; onCancel?: () => void }) {
  const auth = useAuth();
  const { language } = useLanguage();
  const t = emailVerificationMessages[language];
  // Fixed when the flow opens: a session refresh on returning from the mail app must not change what is being verified.
  const [{ origin, email: startEmail, verified }] = useState(start);
  const [email, setEmail] = useState(startEmail);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: boolean; code?: boolean }>({});
  const [notice, setNotice] = useState<VerifyCodeFailure | 'requested' | null>(null);
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [done, setDone] = useState(!!verified);
  // Registering already sent the first code.
  const [wait, setWait] = useState(() => origin === 'signup' ? { address: addressKey(startEmail), until: resendDeadline() } : null);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const unmounted = useRef(false);
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; }; }, []);
  // Another address has its own cooldown.
  const secondsLeft = resendSecondsLeft(wait?.address === addressKey(email) ? wait.until : null, now);
  const waiting = secondsLeft > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [waiting]);

  const service = () => createEmailVerificationService(getBackend());
  function leave() {
    if (onCancel) onCancel();
    else if (router.canGoBack()) router.back();
    else if (origin === 'profile') router.replace(profile);
    else router.replace('/login');
  }
  async function verify() {
    if (pending.current || auth.busy) return;
    const digits = parseEmailCode(code), validEmail = isEmailAddress(email);
    setErrors({ email: !validEmail, code: digits === null });
    setNotice(null);
    if (!validEmail || digits === null) return;
    pending.current = true; setBusy('verify');
    try {
      const result = await service().verifyEmailCode(email, digits);
      if (unmounted.current) return;
      if (!result.ok) { setNotice(result.reason); return; }
      if (origin === 'profile') {
        await auth.restore();
        if (!unmounted.current) leave();
        return;
      }
      const password = takePassword?.();
      const signedIn = !!password && (await auth.loginWithResult({ identifier: email.trim(), password })).ok;
      if (unmounted.current) return;
      if (signedIn) router.replace(profile);
      else setDone(true);
    } catch { setNotice('error'); }
    finally { pending.current = false; setBusy(null); }
  }
  async function resend() {
    if (pending.current || waiting) return;
    const validEmail = isEmailAddress(email);
    setErrors({ email: !validEmail });
    setNotice(null);
    if (!validEmail) return;
    pending.current = true; setBusy('resend');
    try {
      const result = await service().requestEmailVerificationCode(email);
      if (unmounted.current) return;
      if (!result.ok) { setNotice(result.reason); return; }
      setWait({ address: addressKey(email), until: resendDeadline() }); setNow(Date.now());
      setCode(''); setNotice('requested');
    } catch { setNotice('error'); }
    finally { pending.current = false; setBusy(null); }
  }

  if (done) return <AuthShell title={t.verify} subtitle="" onBack={leave}>
    <AuthNotice success>{origin === 'profile' ? t.alreadyVerified : t.verified}</AuthNotice>
    {origin === 'profile' ? <AuthAction label={t.backToProfile} onPress={leave} />
      : <AuthAction label={authMessages[language].login} onPress={() => router.dismissTo('/login')} />}
  </AuthShell>;
  return <AuthShell title={t.title} subtitle={wait ? t.intro : t.introSend} onBack={() => { if (!busy) leave(); }}>
    {origin === 'login' ? <AuthInput label={t.email} value={email} error={errors.email ? t.emailInvalid : undefined} editable={!busy}
      autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} placeholder="you@example.com"
      onChangeText={value => { setEmail(value); setErrors(previous => ({ ...previous, email: false })); setNotice(null); }} />
      : <AppText>{t.sentTo(email)}</AppText>}
    {origin === 'login' && !startEmail && <AppText variant="caption" muted>{t.emailHint}</AppText>}
    <AuthInput code label={t.code} value={code} error={errors.code ? t.codeFormat : undefined} editable={!busy}
      keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoCapitalize="none" selectTextOnFocus
      // No native maxLength: it would cut a pasted code that carries spaces or direction marks before they are removed.
      onChangeText={value => {
        setCode(normalizeEmailCode(value).replace(/[^0-9]/g, '').slice(0, EMAIL_CODE_LENGTH));
        setErrors(previous => ({ ...previous, code: false })); setNotice(null);
      }} onSubmitEditing={() => { void verify(); }} />
    <AppText variant="caption" muted>{t.codeHint}</AppText>
    {notice && <AuthNotice success={notice === 'requested'}>{t[notice]}</AuthNotice>}
    <AuthAction label={busy === 'verify' ? t.verifying : t.verify} busy={busy === 'verify'} disabled={!!busy || auth.busy} onPress={() => { void verify(); }} />
    <AuthLink label={busy === 'resend' ? t.resending : waiting ? t.resendIn(secondsLeft) : wait ? t.resend : t.sendCode}
      disabled={!!busy || waiting} onPress={() => { void resend(); }} />
    {wait && <AppText variant="caption" muted>{t.spam}</AppText>}
    {origin !== 'profile' && <AuthLink label={t.backToLogin} disabled={!!busy} onPress={() => { if (onCancel) onCancel(); else router.dismissTo('/login'); }} />}
  </AuthShell>;
}
