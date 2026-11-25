import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/core';
import { AuthAction, AuthInput, AuthLink, AuthNotice, AuthShell, AuthSocial } from '@/components/auth-ui';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { getAuth } from '@/services/auth';
import { authErrorKey } from '@/services/auth-validation';
import { emptyAuthDraft, isEmailAddress, normalizePhone, passwordRules, phoneCountries, validateAuthDraft, type AuthDraft, type PhoneCountry } from '@/services/auth-form';
import { authMessages } from '@/i18n/auth';
import { EmailVerificationFlow } from './email-verification-screen';
import ProfileScreen from './profile-screen';

export default function AuthScreen({ signup = false }: { signup?: boolean }) {
  const auth = useAuth();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const t = authMessages[language];
  const [draft, setDraft] = useState<AuthDraft>(emptyAuthDraft);
  const [countryCode, setCountryCode] = useState<PhoneCountry>('EG');
  const [countryOpen, setCountryOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof AuthDraft, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const submitting = useRef(false);
  // Only here, only between registering and verifying, so a new account can sign in without typing it again.
  const signupPassword = useRef<string | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; signupPassword.current = null; };
  }, []);
  const inputs = useRef<Partial<Record<keyof AuthDraft, TextInputInstance | null>>>({});
  const country = phoneCountries.find(entry => entry.code === countryCode)!;
  function change(field: keyof AuthDraft, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirmPassword: undefined } : {}) }));
    setError(null);
  }
  async function submit() {
    if (submitting.current || auth.busy || !auth.ready) return;
    const nextErrors = validateAuthDraft(draft, signup, countryCode);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      if (signup) {
        await getAuth().register({ name: draft.name.trim(), username: draft.username.trim().toLowerCase(), email: draft.email.trim(),
          phoneNumber: normalizePhone(draft.phoneNumber, countryCode), password: draft.password, languageCode: language });
        if (unmounted.current) return;
        signupPassword.current = draft.password;
        setVerifying(draft.email.trim());
      } else {
        const identifier = draft.identifier.trim();
        const result = await auth.loginWithResult({ identifier, password: draft.password });
        if (result.ok) router.replace({ pathname: '/feature', params: { feature: 'profile' } });
        else if (result.reason === 'emailNotVerified' && !unmounted.current) {
          router.push(isEmailAddress(identifier) ? { pathname: '/verify-email-code', params: { email: identifier } } : '/verify-email-code');
        }
      }
    } catch (e) { setError(authErrorKey(e)); }
    finally {
      setDraft(previous => ({ ...previous, password: '', confirmPassword: '' }));
      submitting.current = false; setBusy(false);
    }
  }
  const disabled = busy || auth.busy || !auth.ready;
  // Before the signed-in check: signing in is the flow's last step and it leaves this screen itself.
  if (verifying !== null) return <EmailVerificationFlow start={{ origin: 'signup', email: verifying }}
    takePassword={() => { const password = signupPassword.current; signupPassword.current = null; return password; }}
    onCancel={() => { signupPassword.current = null; router.dismissTo('/login'); }} />;
  if (auth.user) return <ProfileScreen />;
  const field = (key: keyof AuthDraft, options: { password?: boolean; placeholder?: string; maxLength?: number } = {}) =>
    <AuthInput key={key} label={t[key]} value={draft[key]} error={errors[key] ? t[errors[key]!] : undefined}
      inputRef={input => { inputs.current[key] = input; }}
      onChangeText={value => change(key, value)} editable={!disabled} autoCapitalize={key === 'name' ? 'words' : 'none'}
      keyboardType={key === 'phoneNumber' ? 'phone-pad' : key === 'email' ? 'email-address' : 'default'}
      autoComplete={key === 'password' || key === 'confirmPassword' ? (signup ? 'new-password' : 'current-password') : key === 'email' ? 'email' : key === 'name' ? 'name' : key === 'phoneNumber' ? 'tel-national' : 'username'}
      returnKeyType={key === 'confirmPassword' || (!signup && key === 'password') ? 'done' : 'next'}
      onSubmitEditing={() => {
        const order: (keyof AuthDraft)[] = signup ? ['name', 'username', 'email', 'phoneNumber', 'password', 'confirmPassword'] : ['identifier', 'password'];
        const next = order[order.indexOf(key) + 1];
        if (next) inputs.current[next]?.focus(); else void submit();
      }} {...options} />;
  const rules = passwordRules(draft.password);
  return <AuthShell title={signup ? t.signupTitle : t.loginTitle} subtitle={signup ? t.signupIntro : t.intro}
    onBack={() => { if (busy) return; if (router.canGoBack()) router.back(); else router.replace({ pathname: '/feature', params: { feature: 'profile' } }); }}>
    {!auth.ready ? <AppText>{t.restoring}</AppText> : <>
      {signup ? <>
        {field('name', { maxLength: 100, placeholder: t.namePlaceholder })}
        {field('username', { maxLength: 30, placeholder: t.usernamePlaceholder })}
        {field('email', { maxLength: 254, placeholder: 'you@example.com' })}
        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.phoneCountry}: ${country.name[language]} ${country.callingCode}`}
            accessibilityState={{ expanded: countryOpen, disabled }} disabled={disabled} onPress={() => setCountryOpen(value => !value)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primarySoft }}>
            <AppText style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{country.name[language]}  {country.callingCode}</AppText><AppText style={{ color: colors.primary }}>⌄</AppText>
          </Pressable>
          {countryOpen && <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}>
            {phoneCountries.map(entry => <Pressable key={entry.code} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: entry.code === countryCode, disabled }}
              onPress={() => { setCountryCode(entry.code); setCountryOpen(false); setErrors(previous => ({ ...previous, phoneNumber: undefined })); }}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: entry.code === countryCode ? colors.primarySoft : colors.surface }}>
              <AppText style={{ fontSize: 14 }}>{entry.name[language]}  {entry.callingCode}{entry.code === countryCode ? '  ✓' : ''}</AppText>
            </Pressable>)}
          </View>}
          {field('phoneNumber', { maxLength: 22, placeholder: countryCode === 'EG' ? '010 1234 5678' : '050 123 4567' })}
        </View>
      </> : field('identifier', { maxLength: 254, placeholder: t.identifierPlaceholder })}
      {field('password', { password: true, maxLength: 128, placeholder: signup ? t.passwordPlaceholder : t.loginPasswordPlaceholder })}
      {signup && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(rules).map(([key, valid]) => <View key={key} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: valid ? colors.successSurface : colors.surfaceMuted }}>
            <AppText style={{ fontSize: 11, color: valid ? colors.successText : colors.textSecondary }}>{valid ? '✓ ' : '○ '}{t[`rule_${key}`]}</AppText>
          </View>)}
        </View>
        {field('confirmPassword', { password: true, maxLength: 128, placeholder: t.confirmPlaceholder })}
      </>}
      {!signup && <View style={{ alignItems: language === 'ar' ? 'flex-start' : 'flex-end', marginTop: -8 }}><AuthLink label={t.forgotPassword} disabled={disabled} onPress={() => router.push('/forgot-password')} /></View>}
      {(error || (!signup && auth.error)) && <AuthNotice>{t[error ?? auth.error!]}</AuthNotice>}
      <AuthAction label={busy || auth.busy ? t.wait : signup ? t.signup : t.login} disabled={disabled} busy={busy || auth.busy} onPress={() => { void submit(); }} />
      {signup && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 6 }}>
        <AppText muted style={{ fontSize: 13 }}>{t.agree}</AppText>
        <AuthLink label={t.terms} disabled={disabled} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
        <AuthLink label={t.privacy} disabled={disabled} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
      </View>}
      {!signup && <AuthSocial />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 6 }}>
        <AppText muted style={{ fontSize: 13 }}>{signup ? t.haveAccount : t.newHere}</AppText>
        <AuthLink label={signup ? t.login : t.signup} disabled={disabled} onPress={() => router.replace(signup ? '/login' : '/signup')} />
      </View>
      {!signup && auth.error && <AuthLink label={t.retry} disabled={disabled} onPress={() => { void auth.restore(); }} />}
    </>}
  </AuthShell>;
}
