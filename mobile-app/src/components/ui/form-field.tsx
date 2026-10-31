import { useState, type PropsWithChildren, type Ref } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { AppText } from './core';
import { useRemyFonts } from '@/theme/fonts';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { layout, radii, spacing } from '@/theme/tokens';

export function FieldGroup({ label, hint, error, children }: PropsWithChildren<{ label: string; hint?: string; error?: string }>) {
  const { colors } = useRemyTheme();
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="label">{label}</AppText>{children}
    {error ? <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" variant="caption" style={{ color: colors.errorText }}>{error}</AppText> : hint && <AppText variant="caption" muted>{hint}</AppText>}
  </View>;
}
export function FormField({ label, hint, error, onFocus, onBlur, inputDirection, inputRef, ...props }: TextInputProps & { label: string; hint?: string; error?: string; inputDirection?: 'ltr' | 'rtl'; inputRef?: Ref<TextInputInstance> }) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const { language } = useLanguage();
  const [focused, setFocused] = useState(false);
  return <FieldGroup label={label} hint={hint} error={error}>
    <TextInput {...props} ref={inputRef} accessibilityLabel={props.accessibilityLabel ?? label} accessibilityHint={error ?? hint} placeholderTextColor={colors.placeholder}
      selectionColor={colors.primary} onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={{ minHeight: props.multiline ? 112 : layout.minTouchTarget, padding: spacing.md, borderRadius: radii.md, borderWidth: focused ? 3 : 1,
        borderColor: error ? colors.errorText : focused ? colors.focusBorder : colors.inputBorder,
        backgroundColor: props.editable === false ? colors.disabledSurface : colors.inputSurface,
        color: props.editable === false ? colors.disabledText : colors.text, fontFamily: fonts.body, fontSize: 16,
        textAlign: language === 'ar' ? 'right' : 'left', writingDirection: inputDirection ?? (language === 'ar' ? 'rtl' : 'ltr'), textAlignVertical: props.multiline ? 'top' : 'center' }} />
  </FieldGroup>;
}
