import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/core';
import { AuthAction, AuthInput, AuthLink, AuthNotice, AuthShell } from '@/components/auth-ui';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { getAuth } from '@/services/auth';
import { getBackend } from '@/services/backend';
import { isEmailAddress, passwordRules } from '@/services/auth-form';
import { createPasswordResetService, type ResetPasswordFailure } from '@/services/password-reset';
import { isResetTokenUsable, parseResetCode, toResetCodeInput } from '@/domain/password-reset';
import { useResendWait } from '@/hooks/use-resend-wait';
import { authMessages } from '@/i18n/auth';
import { passwordResetMessages } from '@/i18n/password-reset';

type Step = 'email' | 'code' | 'password' | 'done';
type Notice = ResetPasswordFailure | 'invalidCode' | 'requested';
const profile = { pathname: '/feature', params: { feature: 'profile' } } as const;
/** Keeps an email left to right inside a right-to-left sentence. */
const isolate = (text: string) => `⁦${text}⁩`;

/**
 * /forgot-password: email, then the 6-digit code, then a new password, in one mounted screen.
 * The reset token and the new password live only in this component's state; they are cleared on success and when a
 * step is left, and go away with the screen. They never enter route params, storage or logs.
 */
export default function ForgotPasswordScreen() {
  const auth = useAuth();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = passwordResetMessages[language];
  const a = authMessages[language];
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reset, setReset] = useState<{ token: string; expiresAt: number } | null>(null);
  const [errors, setErrors] = useState<{ email?: boolean; code?: boolean; password?: 'weakPassword' | 'passwordMismatch' }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const resendWait = useResendWait(email);
  const pending = useRef(false);
  const unmounted = useRef(false);
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; }; }, []);

  const service = () => createPasswordResetService(getBackend(), getAuth());
  function forgetSecrets() { setReset(null); setPassword(''); setConfirmation(''); }
  function goTo(next: Step, keep: Notice | null = null) {
    if (next !== 'password') forgetSecrets();
    if (next === 'email' || next === 'code') setCode('');
    setErrors({}); setNotice(keep); setStep(next);
  }
  function back() {
    if (busy) return;
    if (step === 'password') goTo('code');
    else if (step === 'code') goTo('email');
    else if (router.canGoBack()) router.back();
    else router.replace('/login');
  }
  /** One request at a time; nothing is updated after the screen is gone. */
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await work(); }
    catch { if (!unmounted.current) setNotice('error'); }
    finally { pending.current = false; if (!unmounted.current) setBusy(false); }
  }

  const sendCode = (resend = false) => run(async () => {
    if (resend && resendWait.waiting) return; // the button is disabled too
    if (!isEmailAddress(email)) { setErrors({ email: true }); return; }
    // Back from "Change email" to the same address within its wait: the earlier code still works, and the server
    // would send nothing during its cooldown.
    if (!resend && resendWait.waiting) { goTo('code'); return; }
    setNotice(null);
    const result = await service().requestPasswordReset(email);
    if (unmounted.current) return;
    if (!result.ok) { setNotice(result.reason); return; }
    resendWait.start();
    // The server answers the same for every email, so the code step always follows.
    if (resend) { setCode(''); setErrors({}); setNotice('requested'); } else goTo('code');
  });
  const verifyCode = () => run(async () => {
    const digits = parseResetCode(code);
    if (digits === null) { setErrors({ code: true }); return; }
    setNotice(null);
    const result = await service().verifyPasswordResetCode(email, digits);
    if (unmounted.current) return;
    if (!result.ok) { setNotice(result.reason); return; }
    setReset({ token: result.resetToken, expiresAt: result.expiresAt });
    setErrors({}); setStep('password');
  });
  const savePassword = () => run(async () => {
    if (!Object.values(passwordRules(password)).every(Boolean)) { setErrors({ password: 'weakPassword' }); return; }
    if (password !== confirmation) { setErrors({ password: 'passwordMismatch' }); return; }
    if (!reset || !isResetTokenUsable(reset.expiresAt)) { goTo('code', 'expired'); return; }
    setNotice(null);
    const newPassword = password;
    const result = await service().resetPassword(reset.token, newPassword);
    if (unmounted.current) return;
    if (!result.ok) {
      if (result.reason === 'expired') goTo('code', 'expired');
      else if (result.reason === 'weakPassword') setErrors({ password: 'weakPassword' });
      else setNotice(result.reason);
      return;
    }
    forgetSecrets();
    const login = await auth.loginWithResult({ identifier: email.trim(), password: newPassword });
    if (unmounted.current) return;
    if (login.ok) router.replace(profile);
    else setStep('done');
  });

  const title = step === 'email' ? t.emailTitle : step === 'code' ? t.codeTitle : step === 'password' ? t.passwordTitle : t.done;
  const subtitle = step === 'email' ? t.emailIntro : step === 'code' ? t.codeIntro : step === 'password' ? t.passwordIntro : '';
  const message = notice ? <AuthNotice success={notice === 'requested'}>{t[notice]}</AuthNotice> : null;
  const rules = passwordRules(password);
  return <AuthShell title={title} subtitle={subtitle} onBack={back}>
    {step === 'email' && <>
      <AuthInput ltr label={t.email} value={email} error={errors.email ? t.emailInvalid : undefined} editable={!busy}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} placeholder="you@example.com"
        onChangeText={value => { setEmail(value); setErrors({}); setNotice(null); }} onSubmitEditing={() => { void sendCode(); }} />
      {message}
      <AuthAction label={busy ? t.sending : t.sendCode} busy={busy} disabled={busy} onPress={() => { void sendCode(); }} />
      <AuthLink label={t.backToLogin} disabled={busy} onPress={() => router.dismissTo('/login')} />
    </>}
    {step === 'code' && <>
      <AppText>{t.sentTo(isolate(email.trim()))}</AppText>
      <AuthLink label={t.changeEmail} disabled={busy} onPress={() => goTo('email')} />
      <AuthInput code label={t.code} value={code} error={errors.code ? t.codeFormat : undefined} editable={!busy}
        keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoCapitalize="none" selectTextOnFocus
        // No native maxLength: it would cut a pasted code that carries spaces or direction marks before they are removed.
        onChangeText={value => { setCode(toResetCodeInput(value)); setErrors({}); setNotice(null); }}
        onSubmitEditing={() => { void verifyCode(); }} />
      <AppText variant="caption" muted>{t.codeHint}</AppText>
      {message}
      <AuthAction label={busy ? t.verifying : t.verifyCode} busy={busy} disabled={busy} onPress={() => { void verifyCode(); }} />
      <AuthLink label={resendWait.waiting ? t.resendIn(resendWait.secondsLeft) : t.resend} disabled={busy || resendWait.waiting}
        onPress={() => { void sendCode(true); }} />
      <AppText variant="caption" muted>{t.spam}</AppText>
    </>}
    {step === 'password' && <>
      <AuthInput password label={t.newPassword} value={password} editable={!busy} autoComplete="new-password" textContentType="newPassword" maxLength={128}
        error={errors.password === 'weakPassword' ? t.weakPassword : undefined}
        onChangeText={value => { setPassword(value); setErrors({}); setNotice(null); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(rules).map(([key, valid]) => <View key={key} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: valid ? colors.successSurface : colors.surfaceMuted }}>
          <AppText style={{ fontSize: 11, color: valid ? colors.successText : colors.textSecondary }}>{valid ? '✓ ' : '○ '}{a[`rule_${key}`]}</AppText>
        </View>)}
      </View>
      <AuthInput password label={t.confirmPassword} value={confirmation} editable={!busy} autoComplete="new-password" textContentType="newPassword" maxLength={128}
        error={errors.password === 'passwordMismatch' ? t.passwordMismatch : undefined}
        onChangeText={value => { setConfirmation(value); setErrors({}); setNotice(null); }} onSubmitEditing={() => { void savePassword(); }} />
      {message}
      <AuthAction label={busy ? t.saving : t.savePassword} busy={busy} disabled={busy} onPress={() => { void savePassword(); }} />
    </>}
    {step === 'done' && <>
      <AuthNotice success>{t.doneLogin}</AuthNotice>
      <AuthAction label={t.login} onPress={() => router.dismissTo('/login')} />
    </>}
  </AuthShell>;
}
