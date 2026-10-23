import { createContext, useContext, useState, type PropsWithChildren, type Ref } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextProps, type ViewProps, type TextInputProps } from 'react-native';
import { useRemyTheme } from '@/theme/provider';
import { useRemyFonts } from '@/theme/fonts';
import { layout, radii, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './icon';

type TextVariant = 'title' | 'heading' | 'body' | 'caption' | 'label' | 'brand';
const ScreenDirection = createContext<boolean | undefined>(undefined);
export const ScreenDirectionProvider = ScreenDirection.Provider;
export function AppText({ variant = 'body', muted = false, style, ...props }: TextProps & { variant?: TextVariant; muted?: boolean }) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const rtl = useContext(ScreenDirection);
  const family = variant === 'brand' ? fonts.brand : variant === 'title' || variant === 'heading' || variant === 'label' ? fonts.heading : fonts.body;
  return <Text {...props} style={[textStyles[variant], { fontFamily: family, color: muted ? colors.textSecondary : colors.text, textAlign: 'auto' }, rtl !== undefined && { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, style]} />;
}
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={{ gap: spacing.xs }}><View style={[uiStyles.row, { flexWrap: 'wrap' }]}>
    <AppText variant="title" accessibilityRole="header" style={uiStyles.grow}>{title}</AppText>{action}
  </View>{subtitle && <AppText muted>{subtitle}</AppText>}</View>;
}
export function Screen({ children, rtl, scrollRef, contentGap = spacing.xl }: PropsWithChildren<{ rtl?: boolean; scrollRef?: Ref<ScrollView>; contentGap?: number }>) {
  const { colors } = useRemyTheme();
  return <ScreenDirectionProvider value={rtl}><ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: colors.background }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    contentContainerStyle={[styles.screen, { gap: contentGap }, rtl !== undefined && { direction: rtl ? 'rtl' : 'ltr' }]}>{children}</ScrollView></ScreenDirectionProvider>;
}
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useRemyTheme();
  return <View {...props} style={[styles.card, { backgroundColor: colors.surface }, style]} />;
}
export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={[uiStyles.row, { flexWrap: 'wrap' }]}><AppText variant="heading" accessibilityRole="header" style={uiStyles.grow}>{title}</AppText>
    {action && onPress && <Button label={action} onPress={onPress} variant="text" />}</View>;
}
export function Button({ label, onPress, variant = 'primary', icon, disabled = false, rtl }: {
  label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'text' | 'destructive' | 'dangerText'; icon?: IconName; disabled?: boolean; rtl?: boolean;
}) {
  const { colors } = useRemyTheme();
  const [focused, setFocused] = useState(false);
  const color = disabled ? colors.disabledText : variant === 'primary' ? colors.onPrimary : variant === 'destructive' ? colors.onDestructive : variant === 'dangerText' ? colors.destructive : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, {
      backgroundColor: disabled ? colors.disabledSurface : variant === 'primary' ? (pressed ? colors.primaryPressed : colors.primary) : variant === 'destructive' ? colors.destructive : pressed ? colors.pressedSurface : variant === 'secondary' ? colors.surfaceMuted : 'transparent',
      borderColor: focused ? colors.focusBorder : 'transparent',
      borderWidth: focused ? 3 : 2,
      ...(pressed && !disabled ? { transform: [{ scale: 0.98 }] } : {}),
    }]}>
    {icon && <Icon name={icon} color={color} size={18} rtl={rtl} />}
    <AppText variant="label" style={{ color, flexShrink: 1, textAlign: 'center', textDecorationLine: focused ? 'underline' : 'none' }}>{label}</AppText>
  </Pressable>;
}
export function Badge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'warning' | 'success' | 'unavailable' | 'error' }) {
  const { colors } = useRemyTheme();
  const backgrounds = { info: colors.surfaceMuted, warning: colors.warningSurface, success: colors.successSurface, unavailable: colors.unavailableSurface, error: colors.errorSurface };
  const foregrounds = { info: colors.textSecondary, warning: colors.warningText, success: colors.successText, unavailable: colors.unavailableText, error: colors.errorText };
  return <View style={[styles.badge, { backgroundColor: backgrounds[tone] }]}><AppText variant="caption" style={{ color: foregrounds[tone] }}>{label}</AppText></View>;
}
export function Chip({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useRemyTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.chip, { backgroundColor: disabled ? colors.disabledSurface : pressed ? colors.pressedSurface : selected ? colors.selectedSurface : colors.surface,
      borderColor: focused ? colors.focusBorder : selected ? colors.selectedBorder : colors.border, borderWidth: focused ? 3 : 2 }]}>
    {selected && <Icon name="check" size={14} color={disabled ? colors.disabledText : colors.selectedText} />}
    <AppText variant="label" style={{ color: disabled ? colors.disabledText : selected ? colors.selectedText : colors.textSecondary, flexShrink: 1 }}>{label}</AppText>
  </Pressable>;
}
export function SearchField({ onFocus, onBlur, style, ...props }: TextInputProps) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const [focused, setFocused] = useState(false);
  return <View style={[styles.search, { backgroundColor: colors.inputSurface, borderColor: focused ? colors.focusBorder : colors.inputBorder, borderWidth: focused ? 3 : 2 }]}>
    <Icon name="search" color={colors.textSubtle} size={20} />
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? 'Search kitchen inventory'} placeholderTextColor={colors.placeholder}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={[{ flex: 1, minHeight: layout.minTouchTarget, fontSize: 16, fontFamily: fonts.body, color: colors.text, textAlign: 'auto' }, style]} />
  </View>;
}
export function EmptyState({ title, description, action, onPress }: { title: string; description: string; action?: string; onPress?: () => void }) {
  return <View style={{ gap: spacing.md, paddingVertical: spacing.xl }}><AppText variant="heading">{title}</AppText><AppText muted>{description}</AppText>
    {action && onPress && <Button label={action} onPress={onPress} />}
  </View>;
}
export function ActionRow({ title, subtitle, icon, leading, rtl, children, onPress, disabled = false, divider = false, accessibilityLabel }: PropsWithChildren<{
  title: string; subtitle?: string; icon?: IconName; leading?: React.ReactNode; rtl?: boolean; onPress?: () => void; disabled?: boolean; divider?: boolean; accessibilityLabel?: string;
}>) {
  const { colors } = useRemyTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ disabled }} accessibilityLabel={accessibilityLabel}
    disabled={disabled || !onPress} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ padding: spacing.lg, minHeight: layout.minTouchTarget, backgroundColor: pressed ? colors.pressedSurface : colors.surface,
      borderRadius: radii.md, borderWidth: 2, borderColor: focused ? colors.focusBorder : 'transparent', ...(rtl !== undefined ? { direction: rtl ? 'rtl' : 'ltr' } : {}) })}>
    {divider && <View style={{ height: 1, backgroundColor: colors.divider, marginTop: -spacing.lg, marginBottom: spacing.lg }} />}
    <View style={uiStyles.row}>{leading ?? (icon && <Icon name={icon} color={colors.textSecondary} size={20} />)}
      <View style={[uiStyles.grow, { gap: spacing.xs }]}><AppText variant="label" style={{ color: disabled ? colors.textSecondary : colors.text, textAlign: rtl === undefined ? 'auto' : rtl ? 'right' : 'left' }}>{title}</AppText>
        {subtitle && <AppText variant="caption" muted style={{ textAlign: rtl === undefined ? 'auto' : rtl ? 'right' : 'left' }}>{subtitle}</AppText>}{children}
      </View>{onPress && !disabled && <View style={rtl !== undefined && rtl !== I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><Icon name="chevron" size={16} color={colors.textSubtle} /></View>}
    </View>
  </Pressable>;
}
export const uiStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stack: { gap: spacing.lg }, grow: { flex: 1, minWidth: 0 },
});
const textStyles = StyleSheet.create({
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { ...typography.body }, caption: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' }, brand: { ...typography.brand },
});
const styles = StyleSheet.create({
  screen: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl, maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center' },
  card: { padding: spacing.lg, borderRadius: radii.lg, gap: spacing.md },
  button: { minHeight: layout.minTouchTarget, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.sm, alignSelf: 'flex-start' },
  chip: { minHeight: layout.minTouchTarget, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 2, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  search: { paddingHorizontal: spacing.md, borderWidth: 2, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
