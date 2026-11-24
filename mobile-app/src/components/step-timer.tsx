// Running state: white on #C2146C (5.8:1) in light, night on #FF9CCB (9.6:1) in dark; plain hot pink is too light for text.
import { useEffect, useRef, useState } from 'react';
import { Pressable, Vibration, View } from 'react-native';
import { AppText, uiStyles } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';
import { useLanguage } from '@/providers/language-provider';
import { radii } from '@/theme/tokens';
import { feedback } from '@/services/feedback';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Cook-mode countdown for a step's stated duration. Counts from an end time, so it stays right after the app is backgrounded. */
export function StepTimer({ minutes }: { minutes: number }) {
  const { colors } = useRemyTheme(); const { language } = useLanguage(); const ar = language === 'ar';
  const total = Math.round(minutes * 60);
  const [left, setLeft] = useState(total); const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)); setLeft(next);
      if (next === 0) { setRunning(false); Vibration.vibrate([0, 400, 200, 400]); feedback.success(); }
    };
    const id = setInterval(tick, 250); return () => clearInterval(id);
  }, [running]);
  const toggle = () => {
    feedback.select();
    if (running) { setRunning(false); return; }
    const from = left === 0 ? total : left; setLeft(from); endAt.current = Date.now() + from * 1000; setRunning(true);
  };
  const done = left === 0 && !running;
  const label = done ? (ar ? 'انتهى الوقت · أعد التشغيل' : "Time's up · restart") : running ? `${ar ? 'إيقاف مؤقت' : 'Pause'} · ${clock(left)}` : left < total ? `${ar ? 'استئناف' : 'Resume'} · ${clock(left)}` : `${ar ? 'ابدأ مؤقت' : 'Start timer'} · ${clock(total)}`;
  return <View style={[uiStyles.row, { alignSelf: 'flex-start' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={toggle}
      style={({ pressed }) => [uiStyles.row, { gap: 10, minHeight: 52, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: running || done ? colors.accentText : colors.accentSoft, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name="clock" size={20} color={running || done ? colors.onAccent : colors.accentText} />
      <AppText variant="label" accessibilityLiveRegion={done ? 'assertive' : 'none'} style={{ fontSize: 19, lineHeight: 24, fontVariant: ['tabular-nums'], color: running || done ? colors.onAccent : colors.accentText }}>{label}</AppText>
    </Pressable>
    {!running && left > 0 && left < total && <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إعادة ضبط المؤقت' : 'Reset timer'} onPress={() => setLeft(total)} hitSlop={8} style={{ padding: 8 }}>
      <AppText variant="label" style={{ color: colors.textSecondary }}>{ar ? 'إعادة' : 'Reset'}</AppText></Pressable>}
  </View>;
}
