import { View } from 'react-native';
import { AppText, Card } from '@/components/ui/core';
import { nutritionCopy, percentOf } from '@/domain/nutrition';
import { shiftDay, type NutritionDay } from '@/services/kitchen-api';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';

function Meter({ label, value, unit, target, color, language }: { label: string; value: number; unit: string; target: number | null; color: string; language: 'en' | 'ar' }) {
  const { colors } = useRemyTheme(); const t = nutritionCopy[language];
  const num = (v: number) => Math.round(v).toLocaleString(language);
  const pct = percentOf(value, target);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={`${label}: ${num(value)} ${unit}${target ? `, ${t.target(`${num(target)} ${unit}`)}` : ''}`}
    accessibilityValue={target ? { min: 0, max: target, now: Math.min(value, target) } : undefined} style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <AppText variant="label">{label}</AppText>
      <AppText><AppText variant="label">{num(value)}</AppText>{target ? ` / ${num(target)}` : ''} {unit}</AppText>
    </View>
    {target !== null && <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, pct ?? 0)}%`, height: 8, borderRadius: radii.pill, backgroundColor: color }} />
    </View>}
  </View>;
}

/** Today's logged nutrition against the user's targets, then the last seven days. Data comes from `dailyNutrition`. */
export function NutritionToday({ days, today, calorieTarget, proteinTarget, language }: {
  days: readonly NutritionDay[]; today: string; calorieTarget: number | null; proteinTarget: number | null; language: 'en' | 'ar';
}) {
  const { colors } = useRemyTheme(); const t = nutritionCopy[language]; const dir = language === 'ar' ? 'rtl' : 'ltr';
  const byDate = new Map(days.map(day => [day.date, day]));
  const now = byDate.get(today);
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6)).map(date => ({ date, kcal: Number(byDate.get(date)?.calories ?? 0), meals: byDate.get(date)?.mealCount ?? 0 }));
  const logged = week.filter(day => day.meals > 0);
  const average = logged.length ? logged.reduce((sum, day) => sum + day.kcal, 0) / logged.length : null;
  const scale = Math.max(calorieTarget ?? 0, ...week.map(day => day.kcal), 1);
  const num = (v: number) => Math.round(v).toLocaleString(language);

  return <View style={{ gap: spacing.md }} testID="nutrition-today">
    <Card style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">{t.today}</AppText>
      {now && now.mealCount > 0 ? <>
        <Meter label={t.calories} value={Number(now.calories)} unit={t.kcal} target={calorieTarget} color={colors.primary} language={language} />
        <Meter label={t.protein} value={Number(now.proteinG)} unit={t.g} target={proteinTarget} color={colors.accent} language={language} />
        <AppText muted>{t.carbs} {num(Number(now.carbsG))} {t.g} · {t.fat} {num(Number(now.fatG))} {t.g} · {t.logged(num(now.mealCount), now.mealCount)}</AppText>
      </> : <AppText muted dir={dir}>{t.noMeals}</AppText>}
      {calorieTarget === null && <AppText variant="caption" muted dir={dir}>{t.setGoal}</AppText>}
    </Card>
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <AppText variant="heading" accessibilityRole="header">{t.last7}</AppText>
        {average !== null && <AppText variant="caption" muted>{t.avg} {num(average)} {t.kcal}</AppText>}
      </View>
      {week.map(day => <View key={day.date} accessible accessibilityLabel={`${new Date(`${day.date}T12:00:00`).toLocaleDateString(language, { weekday: 'long' })}: ${day.meals ? `${num(day.kcal)} ${t.kcal}` : '—'}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="caption" muted style={{ width: 40 }}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(language, { weekday: 'short' })}</AppText>
        <View style={{ flex: 1, height: 10, borderRadius: radii.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
          <View style={{ width: `${(day.kcal / scale) * 100}%`, height: 10, borderRadius: radii.pill, backgroundColor: day.date === today ? colors.primary : colors.primarySoft }} />
        </View>
        <AppText variant="caption" style={{ width: 64, textAlign: 'right' }}>{day.meals ? num(day.kcal) : '—'}</AppText>
      </View>)}
    </Card>
  </View>;
}
