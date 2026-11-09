import { createContext, useContext, useState, type PropsWithChildren, type Ref, type ReactElement } from 'react';
import { I18nManager, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type RefreshControlProps, type TextProps, type ViewProps, type TextInputProps } from 'react-native';
import { useRemyTheme } from '@/theme/provider';
import { useRemyFonts } from '@/theme/fonts';
import { layout, radii, spacing, typography } from '@/theme/tokens';
import Animated, { cubicBezier, useAnimatedStyle, useSharedValue, useReducedMotion, withTiming, Easing } from 'react-native-reanimated';
import { useLanguage } from '@/providers/language-provider';
import { Icon, type IconName } from './icon';
import { feedback } from '../../services/feedback';

type TextVariant = 'title' | 'heading' | 'body' | 'caption' | 'label' | 'brand' | 'figure';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const ScreenDirection = createContext<boolean | undefined>(undefined);
export const ScreenDirectionProvider = ScreenDirection.Provider;
export function AppText({ variant = 'body', muted = false, style, dir, ...props }: TextProps & { variant?: TextVariant; muted?: boolean; dir?: 'rtl' | 'ltr' }) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const rtl = useContext(ScreenDirection);
  const { language } = useLanguage();
  const cut = variant === 'brand' || variant === 'title' || variant === 'figure' ? fonts.brand : variant === 'heading' ? fonts.heading : variant === 'label' ? fonts.label : fonts.body;
  const family = language === 'ar' ? typography.family : cut;
  // Static cuts carry their own weight; asking iOS for a heavier weight of a one-face family falls back to the system font.
  const display = variant !== 'body' && variant !== 'caption' && fonts.ready;
  // Native RTL layouts mirror physical alignment; keep layout physical and paragraph direction explicit.
  return <Text {...props} {...(dir && Platform.OS === 'web' ? { dir } : {})} style={[textStyles[variant], { fontFamily: family, ...(display && language !== 'ar' ? { fontWeight: '400' as const, letterSpacing: tracking[variant] ?? 0 } : {}), color: muted ? colors.textSecondary : colors.text, textAlign: 'auto' }, rtl !== undefined && { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, dir && { writingDirection: dir }, Platform.OS !== 'web' && { direction: 'ltr' }, style]} />;
}
export function PageHeader({ title, subtitle, subtitleDirection, action, back }: { title: string; subtitle?: string; subtitleDirection?: 'rtl' | 'ltr'; action?: React.ReactNode; back?: React.ReactNode }) {
  return <View style={{ gap: spacing.xs }}>{back && <View testID="page-header-back" style={{ alignItems: 'flex-start', marginBottom: spacing.sm }}>{back}</View>}<View style={[uiStyles.row, { flexWrap: 'wrap' }]}>
    <AppText variant="title" accessibilityRole="header" style={uiStyles.grow}>{title}</AppText>{action}
  </View>{subtitle && <AppText muted dir={subtitleDirection}>{subtitle}</AppText>}</View>;
}
export function Screen({ children, rtl, scrollRef, footer, refreshControl, contentGap = spacing.xl }: PropsWithChildren<{ rtl?: boolean; scrollRef?: Ref<ScrollViewInstance>; footer?: React.ReactNode; refreshControl?: ReactElement<RefreshControlProps>; contentGap?: number }>) {
  const { colors } = useRemyTheme();
  return <ScreenDirectionProvider value={rtl}><View style={{ flex: 1, backgroundColor: colors.background }}><ScrollView ref={scrollRef} refreshControl={refreshControl} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    contentContainerStyle={[styles.screen, { gap: contentGap }, rtl !== undefined && { direction: rtl ? 'rtl' : 'ltr' }]}>{children}</ScrollView>{footer && <View style={{ paddingHorizontal: 20, paddingVertical: spacing.md, backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.divider }}>{footer}</View>}</View></ScreenDirectionProvider>;
}
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useRemyTheme();
  return <View {...props} style={[styles.card, { backgroundColor: colors.surface, boxShadow: `0 4px 18px ${colors.shadow}` }, style]} />;
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
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const feedback = (down: boolean) => { setPressed(down); scale.set(withTiming(down && !reduced ? 0.98 : 1, { duration: 120, easing: Easing.bezier(0.23, 1, 0.32, 1) })); };
  const color = disabled ? colors.disabledText : variant === 'primary' ? colors.onPrimary : variant === 'destructive' ? colors.onDestructive : variant === 'dangerText' ? colors.destructive : colors.primary;
  const textual = variant === 'text' || variant === 'dangerText';
  // Text buttons keep a 48pt touch area through hitSlop instead of reserving it visually, so a heading's "See all"
  // or a card's last link doesn't push the layout apart.
  return <AnimatedPressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onPressIn={() => feedback(true)} onPressOut={() => feedback(false)}
    hitSlop={textual ? { top: 8, bottom: 8 } : undefined} pressRetentionOffset={16}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={[styles.button, pressStyle, textual && { minHeight: 32, paddingVertical: 4, paddingHorizontal: spacing.sm }, icon === 'back' && { alignSelf: 'flex-start' }, {
      backgroundColor: disabled ? colors.disabledSurface : variant === 'primary' ? (pressed ? colors.primaryPressed : colors.primary) : variant === 'destructive' ? colors.destructive : pressed ? colors.pressedSurface : variant === 'secondary' ? colors.primarySoft : 'transparent',
      borderColor: focused ? colors.focusBorder : 'transparent',
      borderWidth: focused ? 3 : 2,
    }]}>
    {icon && <Icon name={icon} color={color} size={18} rtl={rtl} />}
    <AppText variant="label" style={{ color, flexShrink: 1, textAlign: 'center', textDecorationLine: focused ? 'underline' : 'none' }}>{label}</AppText>
  </AnimatedPressable>;
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
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  // Press feedback on press-in as a CSS transition; the selection tick lands with the change it causes.
  return <AnimatedPressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { feedback.select(); onPress(); }}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={[styles.chip, { backgroundColor: disabled ? colors.disabledSurface : pressed ? colors.pressedSurface : selected ? colors.selectedSurface : colors.surface,
      borderColor: focused ? colors.focusBorder : selected ? colors.selectedBorder : colors.border, borderWidth: focused ? 3 : 1.5,
      transform: [{ scale: pressed && !reduced ? 0.96 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: EASE_OUT }]}>
    <AppText variant="label" style={{ color: disabled ? colors.disabledText : selected ? colors.selectedText : colors.textSecondary, flexShrink: 1 }}>{label}</AppText>
  </AnimatedPressable>;
}
export function SearchField({ onFocus, onBlur, style, ...props }: TextInputProps) {
  const { colors } = useRemyTheme();
  const fonts = useRemyFonts();
  const [focused, setFocused] = useState(false);
  return <View style={[styles.search, { backgroundColor: colors.inputSurface, borderColor: focused ? colors.focusBorder : colors.inputBorder, borderWidth: focused ? 2 : 1 }]}>
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
export function ActionRow({ title, subtitle, icon, leading, trailing, subtitleStyle, subtitleDirection, rtl, children, onPress, disabled = false, divider = false, dense = false, accessibilityLabel }: PropsWithChildren<{
  /** Tighter vertical padding for long lists of items, such as the kitchen. */ dense?: boolean;
  title: string; subtitle?: string; icon?: IconName; leading?: React.ReactNode; trailing?: React.ReactNode; subtitleStyle?: TextProps['style']; subtitleDirection?: 'rtl' | 'ltr'; rtl?: boolean; onPress?: () => void; disabled?: boolean; divider?: boolean; accessibilityLabel?: string;
}>) {
  const { colors } = useRemyTheme();
  const [focused, setFocused] = useState(false);
  const screenRtl = useContext(ScreenDirection);
  const rowRtl = rtl ?? screenRtl ?? I18nManager.isRTL ?? false;
  const captionStyle: TextProps['style'] = { textAlign: rtl === undefined ? 'auto' : rtl ? 'right' : 'left' };
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ disabled }} accessibilityLabel={accessibilityLabel}
    disabled={disabled || !onPress} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ padding: spacing.lg, paddingVertical: dense ? spacing.md : spacing.lg, minHeight: layout.minTouchTarget, backgroundColor: pressed ? colors.pressedSurface : colors.surface,
      borderRadius: radii.md, borderWidth: 2, borderColor: focused ? colors.focusBorder : 'transparent', ...(rtl !== undefined ? { direction: rtl ? 'rtl' : 'ltr' } : {}) })}>
    {divider && <View style={{ height: 1, backgroundColor: colors.divider, marginTop: dense ? -spacing.md : -spacing.lg, marginBottom: dense ? spacing.md : spacing.lg }} />}
    <View style={uiStyles.row}>{leading ?? (icon && <Icon name={icon} color={colors.textSecondary} size={20} />)}
      <View style={[uiStyles.grow, { gap: spacing.xs }]}><AppText variant="label" style={{ color: disabled ? colors.textSecondary : colors.text, textAlign: rtl === undefined ? 'auto' : rtl ? 'right' : 'left' }}>{title}</AppText>
        {subtitle && <AppText variant="caption" muted dir={subtitleDirection} style={subtitleStyle ? [captionStyle, subtitleStyle] : captionStyle}>{subtitle}</AppText>}{children}
      </View>{onPress && !disabled && (trailing ?? <Icon name="chevron" size={16} color={colors.textSubtle} rtl={rowRtl} />)}
    </View>
  </Pressable>;
}
/**
 * An iOS-style segmented control for choosing one of a few settings: a muted track and a raised thumb that slides
 * to the choice (200 ms, strong ease-out; instant under Reduce Motion). The thumb is absolutely positioned and
 * childless, so moving it lays out nothing else.
 */
export function Segmented({ options, value, onChange, disabled = false, label }: { options: readonly { key: string; label: string }[]; value: string; onChange: (key: string) => void; disabled?: boolean; label?: string }) {
  const { colors, mode } = useRemyTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(o => o.key === value)), segment = options.length ? (width - 6) / options.length : 0;
  const rtl = useContext(ScreenDirection) ?? false;
  const offset = 3 + (rtl ? options.length - 1 - index : index) * segment;
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={e => setWidth(e.nativeEvent.layout.width)}
    style={{ flexDirection: rtl ? 'row-reverse' : 'row', height: 40, padding: 3, borderRadius: radii.pill, backgroundColor: mode === 'dark' ? colors.surfaceMuted : colors.pressedSurface, direction: 'ltr', opacity: disabled ? 0.6 : 1 }}>
    {width > 0 && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 3, bottom: 3, left: 0, width: segment, borderRadius: radii.pill,
      backgroundColor: mode === 'dark' ? colors.surfaceElevated : colors.surface, boxShadow: `0 2px 6px ${colors.shadow}`,
      transform: [{ translateX: offset }], transitionProperty: 'transform', transitionDuration: reduced ? '0ms' : '200ms', transitionTimingFunction: EASE_OUT }} />}
    {options.map(option => { const selected = option.key === value;
      return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ selected, disabled }} disabled={disabled} hitSlop={4}
        onPress={() => { if (!selected) { feedback.select(); onChange(option.key); } }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="label" numberOfLines={1} style={{ fontSize: 14, color: selected ? colors.text : colors.textSecondary }}>{option.label}</AppText>
      </Pressable>; })}
  </View>;
}
/** Text tabs with a hot-pink dot on the selected one; scrolls sideways when the cuisines run long. */
export function TextTabs({ tabs, value, onChange, rtl }: { tabs: readonly { key: string; label: string }[]; value: string; onChange: (key: string) => void; rtl?: boolean }) {
  const { colors } = useRemyTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ marginHorizontal: -20, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ paddingHorizontal: 20, gap: 20 }}>
    {tabs.map(tab => { const selected = tab.key === value;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { if (!selected) feedback.select(); onChange(tab.key); }} hitSlop={6}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Tabs switch too often to animate; only the 6 pt dot settles in, in 150 ms. */}
        <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, opacity: selected ? 1 : 0, transform: [{ scale: selected ? 1 : 0.4 }],
          transitionProperty: ['opacity', 'transform'], transitionDuration: '150ms', transitionTimingFunction: EASE_OUT }} />
        <AppText variant={selected ? 'label' : 'body'} style={{ color: selected ? colors.text : colors.textSecondary }}>{tab.label}</AppText>
      </Pressable>; })}
  </ScrollView>;
}

export const uiStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stack: { gap: spacing.lg }, grow: { flex: 1, minWidth: 0 },
});
/** Size-specific tracking: large display type tightens as it grows (never for Arabic, where spacing breaks the joins). */
const tracking: Partial<Record<TextVariant, number>> = { figure: -0.8, title: -0.5, brand: -0.3, heading: -0.2 };
const textStyles = StyleSheet.create({
  title: { fontSize: 32, lineHeight: 37, fontWeight: '800' },
  /** A headline number: display cut, tabular figures so values don't jitter as they change. */
  figure: { fontSize: 34, lineHeight: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heading: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  body: { ...typography.body }, caption: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' }, brand: { ...typography.brand },
});
const styles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: spacing.xxl, gap: spacing.xl, maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center' },
  card: { padding: spacing.lg, borderRadius: radii.lg, gap: spacing.md },
  button: { minHeight: 48, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.pill, borderWidth: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, alignSelf: 'flex-start' },
  chip: { minHeight: layout.minTouchTarget, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderWidth: 1.5, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  search: { paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
