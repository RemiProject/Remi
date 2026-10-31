import { useState, type PropsWithChildren, type Ref } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/core';
import { useRemyTheme } from '@/theme/provider';
import { useRemyFonts } from '@/theme/fonts';
import { useLanguage } from '@/providers/language-provider';
import { authMessages } from '@/i18n/auth';

export function AuthShell({ title, subtitle, onBack, children }: PropsWithChildren<{ title: string; subtitle: string; onBack: () => void }>) {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = authMessages[language];
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 20, paddingBottom: 36 }}>
        <View style={{ width: '100%', maxWidth: 460, gap: 24, direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AuthLink label={`${language === 'ar' ? '→' : '←'}  ${t.back}`} onPress={onBack} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><AppText style={{ color: colors.onPrimary, fontWeight: '800', fontSize: 20 }}>r</AppText></View>
              <AppText style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.8 }}>remy</AppText>
            </View>
          </View>
          <View style={{ gap: 10, paddingTop: 8 }}>
            <AppText style={{ color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: language === 'en' ? 2 : 0 }}>{t.authEyebrow}</AppText>
            <AppText accessibilityRole="header" style={{ fontSize: 34, lineHeight: 41, fontWeight: '800', letterSpacing: -1, textAlign: language === 'ar' ? 'right' : 'left' }}>{title}</AppText>
            <AppText muted style={{ fontSize: 15, lineHeight: 23, textAlign: language === 'ar' ? 'right' : 'left' }}>{subtitle}</AppText>
          </View>
          <View style={{ padding: 20, borderRadius: 24, gap: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>{children}</View>
          <AppText variant="caption" muted style={{ textAlign: 'center', lineHeight: 20 }}>{t.local}</AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function AuthInput({ label, error, password = false, inputRef, ...props }: TextInputProps & { label: string; error?: string; password?: boolean; inputRef?: Ref<TextInputInstance> }) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const { language } = useLanguage();
  const t = authMessages[language];
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: 7 }}>
    <AppText style={{ fontSize: 13, fontWeight: '600' }}>{label}</AppText>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5,
      borderColor: error ? colors.errorText : focused ? colors.focusBorder : colors.border, backgroundColor: colors.inputSurface }}>
      <TextInput {...props} ref={inputRef} accessibilityLabel={label} accessibilityHint={error} autoCorrect={false}
        secureTextEntry={password && !visible} placeholderTextColor={colors.placeholder} selectionColor={colors.primary}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12,
          fontFamily: fonts.body, color: colors.text, fontSize: 16, textAlign: language === 'ar' ? 'right' : 'left' }} />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? t.hidePassword : t.showPassword}
        accessibilityState={{ expanded: visible }} onPress={() => setVisible(value => !value)}
        style={{ minWidth: 52, minHeight: 48, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{visible ? t.hide : t.show}</AppText>
      </Pressable>}
    </View>
    {error && <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.errorText, fontSize: 12, lineHeight: 18 }}>{error}</AppText>}
  </View>;
}

export function AuthAction({ label, onPress, disabled = false, busy = false }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors } = useRemyTheme();
  const inactive = disabled && !busy;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    onPress={onPress} style={({ pressed }) => ({ minHeight: 54, padding: 14, borderRadius: 16, backgroundColor: inactive ? colors.disabledSurface : pressed ? colors.primaryPressed : colors.primary,
      flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' })}>
    {busy && <ActivityIndicator color={colors.onPrimary} />}<AppText style={{ color: inactive ? colors.disabledText : colors.onPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{label}</AppText>
  </Pressable>;
}
export function AuthLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 10 }}>
    <AppText style={{ fontSize: 14, fontWeight: '600', color: disabled ? colors.disabledText : colors.primary }}>{label}</AppText>
  </Pressable>;
}
export function AuthNotice({ children, success = false }: PropsWithChildren<{ success?: boolean }>) {
  const { colors } = useRemyTheme();
  return <View style={{ backgroundColor: success ? colors.successSurface : colors.errorSurface, padding: 14, borderRadius: 14 }}>
    <AppText accessibilityRole={success ? 'text' : 'alert'} accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 22, color: success ? colors.successText : colors.errorText }}>{children}</AppText>
  </View>;
}
export function AuthSocial() {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const t = authMessages[language];
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /><AppText variant="caption" muted>{t.orContinue}</AppText><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {['Google', 'Apple'].map(provider => <Pressable key={provider} disabled accessibilityRole="button" accessibilityLabel={`${provider}. ${t.socialUnavailable}`} accessibilityState={{ disabled: true }}
        style={{ flexGrow: 1, flexBasis: 130, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
        <AppText style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{provider}</AppText>
      </Pressable>)}
    </View><AppText variant="caption" muted style={{ textAlign: 'center', fontSize: 11 }}>{t.socialUnavailable}</AppText>
  </View>;
}
