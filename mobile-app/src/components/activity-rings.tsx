import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { AppText } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import type { Award, Ring, RingKey } from '@/domain/nutrition-rings';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Ring colours: vivid on the night panel, the brand's pink, a cobalt lifted for dark ground, and a fresh green for fibre. */
export const ringColors: Record<RingKey, string> = { fuel: '#FF4F9A', protein: '#7C8CFF', fibre: '#9BE15D' };

/** One arc: a faint full track, then the progress drawn clockwise from the top. Progress past a full lap shows full. */
function Arc({ radius, stroke, color, progress, delay, animate }: { radius: number; stroke: number; color: string; progress: number; delay: number; animate: boolean }) {
  const circumference = 2 * Math.PI * radius;
  const shown = useSharedValue(animate ? 0 : Math.min(1, progress));
  useEffect(() => {
    // Rare enough to celebrate: the rings sweep in once (ease-out, 900 ms, staggered) and ease to new values after.
    shown.set(animate ? withDelay(delay, withTiming(Math.min(1, progress), { duration: 900, easing: EASE_OUT })) : Math.min(1, progress));
  }, [progress, animate, delay, shown]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - Math.max(0.001, shown.get())) }));
  return <>
    <Circle r={radius} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={stroke} />
    <AnimatedCircle r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} animatedProps={props} />
  </>;
}

/** Three concentric rings, outermost first (Fuel, Protein, Fibre), Apple-Fitness style. */
export function ActivityRings({ rings, size, stroke, animate = true, label }: { rings: Ring[]; size: number; stroke: number; animate?: boolean; label?: string }) {
  const reduced = useReducedMotion();
  const gap = Math.max(1.5, stroke * 0.12);
  return <View accessible={!!label} accessibilityLabel={label} style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      <G x={size / 2} y={size / 2} rotation={-90}>
        {rings.map((ring, i) => <Arc key={ring.key} radius={size / 2 - stroke / 2 - i * (stroke + gap)} stroke={stroke} color={ringColors[ring.key]}
          progress={ring.progress} delay={i * 120} animate={animate && !reduced} />)}
      </G>
    </Svg>
  </View>;
}

/** An award medallion: the colour disc and icon when earned; a grey disc with a progress ring while not. */
export function Medal({ award, title, note, color, muted, ink }: { award: Award; title: string; note: string; color: string; muted: string; ink: string }) {
  const size = 64, r = size / 2 - 3, circumference = 2 * Math.PI * r, progress = Math.min(1, award.have / award.need);
  return <View accessible accessibilityLabel={`${title}. ${note}`} style={{ width: '33.3%', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 7} fill={award.earned ? color : muted} />
        {!award.earned && <G x={size / 2} y={size / 2} rotation={-90}>
          <Circle r={r} fill="none" stroke={muted} strokeWidth={3} />
          <Circle r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - progress)} />
        </G>}
      </Svg>
      <Icon name={award.icon} size={24} color={award.earned ? '#FFFFFF' : ink} />
    </View>
    <AppText variant="label" numberOfLines={1} style={{ fontSize: 13, textAlign: 'center' }}>{title}</AppText>
    <AppText variant="caption" muted numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, textAlign: 'center' }}>{note}</AppText>
  </View>;
}
