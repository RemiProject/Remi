import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { AppText } from '@/components/ui/core';
import { ticks } from '@/domain/nutrition-dashboard';
import { useRemyTheme } from '@/theme/provider';

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const fmt = (n: number) => Math.round(n).toLocaleString('en');
function useWidth() {
  const [width, setWidth] = useState(0);
  return [width, (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))] as const;
}

/**
 * Columns per period (days or months) on a round 0-based scale, with the goal as a dashed rule.
 * Square-topped columns, horizontal gridlines only, ticks on the leading side, no y-axis line.
 */
export function ColumnChart({ values, labels, target, color, height = 168, label, rtl = false }: {
  values: (number | null)[]; labels: (string | null)[]; target?: number | null; color: string; height?: number; label: string;
  /** Right to left: the newest period on the left and the scale on the right, matching the mirrored goal bar above. */ rtl?: boolean;
}) {
  const { colors } = useRemyTheme(); const [width, onLayout] = useWidth();
  const scale = ticks(Math.max(target ?? 0, ...values.map(v => v ?? 0)));
  const top = scale[scale.length - 1] || 1, axis = 34, plotW = Math.max(0, width - axis), plotH = height - 22, pad = 8; // room for the top tick label
  const slot = values.length ? plotW / values.length : 0, barW = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => pad + (plotH - pad) * (1 - v / top);
  const left = rtl ? 0 : axis, slotX = (i: number) => left + (rtl ? values.length - 1 - i : i) * slot, tickX = rtl ? width - axis + 6 : axis - 6;
  return <View onLayout={onLayout} accessible accessibilityLabel={label} style={{ height }}>
    {width > 0 && <Svg width={width} height={height}>
      {scale.map(t => <Line key={t} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? colors.border : colors.divider} strokeWidth={t === 0 ? 1.5 : 1} />)}
      {scale.map(t => <SvgText key={`t${t}`} x={tickX} y={y(t) + 4} fontSize={11} fill={colors.textSubtle} textAnchor={rtl ? 'start' : 'end'}>{t >= 1000 ? `${t / 1000}k` : t}</SvgText>)}
      {values.map((v, i) => v === null ? null : <Rect key={i} x={slotX(i) + (slot - barW) / 2} y={y(v)} width={barW} height={Math.max(1, plotH - y(v))} rx={2} fill={color} />)}
      {target ? <Line x1={left} x2={left + plotW} y1={y(target)} y2={y(target)} stroke={colors.text} strokeWidth={1} strokeDasharray="4 3" /> : null}
      {labels.map((l, i) => l === null ? null : <SvgText key={`l${i}`} x={slotX(i) + slot / 2} y={height - 4} fontSize={11} fill={colors.textSubtle} textAnchor="middle">{l}</SvgText>)}
    </Svg>}
  </View>;
}

/** Weight over time: one line, dots on each reading, the latest labelled; the scale hugs the readings (weight never starts at 0). */
export function LineChart({ points, color, height = 132, label, unit }: { points: { t: number; v: number }[]; color: string; height?: number; label: string; unit: string }) {
  const { colors } = useRemyTheme(); const [width, onLayout] = useWidth();
  if (points.length < 2) return null;
  const vs = points.map(p => p.v), lo = Math.floor(Math.min(...vs) - 0.5), hi = Math.ceil(Math.max(...vs) + 0.5);
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1, axis = 34, plotW = Math.max(0, width - axis - 8), plotH = height - 8;
  const x = (t: number) => axis + ((t - t0) / (t1 - t0 || 1)) * plotW, y = (v: number) => 4 + plotH - ((v - lo) / (hi - lo)) * plotH;
  const last = points[points.length - 1];
  return <View onLayout={onLayout} accessible accessibilityLabel={label} style={{ height }}>
    {width > 0 && <Svg width={width} height={height}>
      {[lo, (lo + hi) / 2, hi].map(t => <Line key={t} x1={axis} x2={width} y1={y(t)} y2={y(t)} stroke={colors.divider} strokeWidth={1} />)}
      {[lo, (lo + hi) / 2, hi].map(t => <SvgText key={`t${t}`} x={axis - 6} y={y(t) + 4} fontSize={11} fill={colors.textSubtle} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</SvgText>)}
      <Polyline points={points.map(p => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <Circle key={i} cx={x(p.t)} cy={y(p.v)} r={i === points.length - 1 ? 4 : 2.5} fill={i === points.length - 1 ? color : colors.surface} stroke={color} strokeWidth={1.5} />)}
      <SvgText x={Math.min(x(last.t), width - 4)} y={Math.max(12, y(last.v) - 9)} fontSize={11} fontWeight="600" fill={colors.text} textAnchor="end">{`${last.v} ${unit}`}</SvgText>
    </Svg>}
  </View>;
}

/**
 * How far to the target: a track with the true ratio filled, both ends labelled. The fill grows from empty the first
 * time it shows (it is the page's answer) and eases to new values when the period changes.
 */
export function ProgressBar({ value, max, color, start, end, over }: { value: number; max: number; color: string; start: string; end: string; over?: string }) {
  const { colors } = useRemyTheme(); const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced);
  useEffect(() => { if (!shown) queueMicrotask(() => setShown(true)); }, [shown]);
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return <View style={{ gap: 6 }}>
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.divider, overflow: 'hidden' }}>
      {/* Absolutely positioned and childless, so animating its width re-lays out nothing else. */}
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, borderRadius: 5, backgroundColor: value > max && max > 0 ? colors.accent : color,
        width: `${(shown ? ratio : 0) * 100}%`, transitionProperty: 'width', transitionDuration: reduced ? '0ms' : '600ms', transitionTimingFunction: EASE_OUT }} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="caption" muted>{start}</AppText>
      <AppText variant="caption" muted style={over && value > max ? { color: colors.accentText } : undefined}>{over && value > max ? over : end}</AppText>
    </View>
  </View>;
}

/** A 100% bar of energy from protein, carbs and fat, split by 2 pt seams. */
export function ShareBar({ parts }: { parts: { value: number; color: string }[] }) {
  const { colors } = useRemyTheme();
  return <View style={{ flexDirection: 'row', height: 12, gap: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface }}>
    {parts.filter(p => p.value > 0).map((p, i) => <View key={i} style={{ flex: p.value, backgroundColor: p.color }} />)}
  </View>;
}

export const formatNumber = fmt;
