import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { AppText, Button, Card, EmptyState, PageHeader, Screen, TextTabs, uiStyles } from '@/components/ui/core';
import { Icon, type IconName } from '@/components/ui/icon';
import { ColumnChart, LineChart, ProgressBar, ShareBar, formatNumber as n } from '@/components/dashboard-charts';
import { bmi, energyShare, monthly, periodDates, shiftDate, streak, summarize, toDayTotals, weightTrend, type DayTotals, type Period } from '@/domain/nutrition-dashboard';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { kitchenRequest, todayKey } from '@/services/kitchen-api';
import { useRemyTheme } from '@/theme/provider';
import { radii } from '@/theme/tokens';
import { DataNotice, useKitchenData } from './connected-ui';

interface Data {
  days: DayTotals[];
  profile: { goal: { goalType: string; calorieTarget: number | null; proteinTargetG: number | null; targetWeightKg: string | null } | null; profile: { heightCm: string | null; weightKg: string | null } | null;
    allergies: unknown[]; healthConditions: unknown[]; dietaryPreferences: string[] };
  weights: { measuredAt: string; weightKg: number }[];
  overview: { firstDate: string | null; daysLogged: number; mealCount: number; avgCalories: string; avgProteinG: string; avgCarbsG: string; avgFatG: string; avgFiberG: string; avgSugarG: string; avgSodiumMg: string };
}

/** One request for the whole page: a year of daily totals, the profile, weights and the all-time summary. Periods switch locally. */
async function load(today: string): Promise<Data> {
  const r = await kitchenRequest<{ dailyNutrition: Record<string, unknown>[]; myProfile: Data['profile']; weightHistory: { measuredAt: string; weightKg: string }[]; nutritionOverview: Data['overview'] }>(
    `query Nutrition($from: String!, $to: String!) {
      dailyNutrition(from: $from, to: $to) { date calories proteinG carbsG fatG fiberG sugarG sodiumMg mealCount }
      myProfile { goal { goalType calorieTarget proteinTargetG targetWeightKg } profile { heightCm weightKg } allergies { foodId } healthConditions { healthConditionId } dietaryPreferences }
      weightHistory { measuredAt weightKg }
      nutritionOverview { firstDate daysLogged mealCount avgCalories avgProteinG avgCarbsG avgFatG avgFiberG avgSugarG avgSodiumMg }
    }`, { from: shiftDate(today, -365), to: today });
  return { days: toDayTotals(r.dailyNutrition), profile: r.myProfile, weights: r.weightHistory.map(w => ({ measuredAt: String(w.measuredAt), weightKg: Number(w.weightKg) })), overview: r.nutritionOverview };
}

export default function NutritionScreen() {
  const { user, ready } = useAuth(); const { language } = useLanguage(); const ar = language === 'ar';
  const { colors, mode } = useRemyTheme(); const reduced = useReducedMotion();
  const c = (en: string, arabic: string) => ar ? arabic : en;
  const [period, setPeriod] = useState<Period>('week');
  const [allRows, setAllRows] = useState(false);
  const today = todayKey();
  const state = useKitchenData(() => load(today), 'nutrition');
  // Three distinct hues in both themes (dark mode's primary is lemon, so protein gets its own blue there).
  const series = mode === 'dark' ? { protein: '#8C9BFF', carbs: '#F8E45C', fat: colors.accent } : { protein: colors.primary, carbs: '#D9B300', fat: colors.accent };
  const back = <Button label={c('Back', 'رجوع')} icon="back" variant="text" rtl={ar} onPress={() => router.canGoBack() ? router.back() : router.replace('/more')} />;
  const logFood = <Button label={c('Log food', 'سجّل طعامًا')} icon="add" variant="secondary" onPress={() => router.push('/health')} />;

  const view = useMemo(() => {
    if (!state.data) return null;
    const { days, profile, overview } = state.data;
    const goal = { calorieTarget: profile.goal?.calorieTarget ?? null, proteinTargetG: profile.goal?.proteinTargetG ?? null };
    if (period === 'all') {
      const avg = (k: keyof Data['overview']) => Number(overview[k]) || 0;
      return { kind: 'all' as const, goal, logged: overview.daysLogged, meals: overview.mealCount, since: overview.firstDate,
        average: { calories: avg('avgCalories'), proteinG: avg('avgProteinG'), carbsG: avg('avgCarbsG'), fatG: avg('avgFatG'), fiberG: avg('avgFiberG'), sugarG: avg('avgSugarG'), sodiumMg: avg('avgSodiumMg') },
        months: monthly(days, today) };
    }
    return { kind: period, goal, summary: summarize(days, periodDates(today, period), goal) };
  }, [state.data, period, today]);

  const tabs = [{ key: 'today', label: c('Today', 'اليوم') }, { key: 'week', label: c('7 days', '٧ أيام') }, { key: 'month', label: c('30 days', '٣٠ يومًا') }, { key: 'all', label: c('All time', 'كل الوقت') }];
  const enter = (i: number) => reduced ? undefined : FadeInDown.duration(260).delay(i * 50);

  if (ready && !user) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={c('Nutrition', 'التغذية')} back={back} />
    <EmptyState title={c('Your eating, at a glance.', 'طعامك في لمحة.')} description={c('Sign in to see your days, weeks and months.', 'سجّل الدخول لترى أيامك وأسابيعك وأشهرك.')} action={c('Sign in', 'تسجيل الدخول')} onPress={() => router.push('/login')} />
  </Screen></SafeAreaView>;

  const data = state.data; const avg = view && (view.kind === 'all' ? view.average : view.summary.average);
  const loggedCount = view ? view.kind === 'all' ? view.logged : view.summary.logged.length : 0;
  const share = avg ? energyShare(avg) : null;
  const target = view?.goal.calorieTarget ?? null;
  const headline = !view ? 0 : view.kind === 'today' ? view.summary.days[0]?.calories ?? 0 : avg!.calories;
  const windowStart = view?.kind === 'week' || view?.kind === 'month' ? view.summary.dates[0] : view?.kind === 'today' ? today : null;
  const trend = data ? weightTrend(data.weights, windowStart) : null;
  const body = data ? bmi(Number(data.profile.profile?.heightCm) || null, trend?.latest ?? (Number(data.profile.profile?.weightKg) || null)) : null;

  const g = (v: number) => `${n(v)} ${c('g', 'غ')}`, mg = (v: number) => `${n(v)} ${c('mg', 'ملغ')}`, kg = (v: number) => `${v} ${c('kg', 'كغ')}`;
  const longDate = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  // The one finding, read first: how the period went against the goal, or what is missing to say so.
  const finding = !view ? '' : !loggedCount ? c('Nothing logged in this period yet.', 'لا شيء مسجّل في هذه الفترة بعد.')
    : view.kind === 'today' ? (target ? (headline <= target ? c(`${n(target - headline)} kcal left for today.`, `تبقّى ${n(target - headline)} سعرة لليوم.`) : c(`${n(headline - target)} kcal over today's goal.`, `تجاوزت هدف اليوم بـ ${n(headline - target)} سعرة.`)) : c('Set a calorie goal to see what is left.', 'حدّد هدفًا للسعرات لترى ما تبقّى.'))
    : view.kind === 'all' ? c(`${n(view.logged)} ${view.logged === 1 ? 'day' : 'days'} and ${n(view.meals)} ${view.meals === 1 ? 'meal' : 'meals'} logged since ${longDate(view.since)}.`, `${n(view.logged)} يومًا و${n(view.meals)} وجبة منذ ${longDate(view.since)}.`)
    : view.summary.onTarget !== null ? c(`On target ${view.summary.onTarget} of ${loggedCount} logged ${loggedCount === 1 ? 'day' : 'days'}.`, `ضمن الهدف في ${view.summary.onTarget} من ${loggedCount} أيام مسجّلة.`)
    : c(`${loggedCount} of ${view.summary.dates.length} ${view.summary.dates.length === 1 ? 'day' : 'days'} logged.`, `${loggedCount} من ${view.summary.dates.length} أيام مسجّلة.`);

  const dayLabel = (date: string, i: number, total: number) => total <= 7 ? new Date(`${date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'narrow' }) : i % 5 === 4 || i === 0 ? String(Number(date.slice(8))) : null;
  const goalNames: Record<string, [string, string]> = { LOSE_WEIGHT: ['Lose weight', 'إنقاص الوزن'], GAIN_MUSCLE: ['Build muscle', 'بناء العضلات'], MAINTAIN: ['Maintain', 'الحفاظ على الوزن'], CUSTOM: ['Custom', 'مخصص'] };
  const bandNames = { under: c('below the healthy range', 'أقل من المعدل الصحي'), healthy: c('healthy range', 'المعدل الصحي'), over: c('above the healthy range', 'أعلى من المعدل الصحي'), obese: c('well above the healthy range', 'أعلى بكثير من المعدل الصحي') };
  // A fall is good news when the goal is to lose weight, a rise when it is to build muscle; otherwise the change stays grey.
  const profileGoal = data?.profile.goal?.goalType;
  const goodChange = (change: number) => profileGoal === 'LOSE_WEIGHT' ? change < 0 : profileGoal === 'GAIN_MUSCLE' ? change > 0 : null;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={c('Nutrition', 'التغذية')} back={back} action={logFood} subtitle={finding || undefined} />
    <TextTabs tabs={tabs} value={period} onChange={key => setPeriod(key as Period)} rtl={ar} />
    <DataNotice {...state} />
    {view && !loggedCount && <EmptyState title={c('Nothing here yet.', 'لا شيء هنا بعد.')} description={c('Cook a recipe in Remi or log food you ate out, and your days fill in.', 'اطبخ وصفة في ريمي أو سجّل طعامًا أكلته خارج المنزل، وستمتلئ أيامك.')} />}

    {view && loggedCount > 0 && <>
      {/* The answer: calories against the goal, then how the days went. */}
      <Animated.View entering={enter(0)}><Card style={{ gap: 14 }}>
        <AppText variant="caption" muted>{view.kind === 'today' ? c('Eaten today', 'المتناول اليوم') : c('Average per logged day', 'المتوسط لكل يوم مسجّل')}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <AppText style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{n(headline)}</AppText>
          <AppText muted>{c('kcal', 'سعرة')}</AppText>
        </View>
        {target ? <ProgressBar value={headline} max={target} color={colors.primary} start="0" end={c(`Goal ${n(target)}`, `الهدف ${n(target)}`)} over={c(`${n(headline - target)} over`, `+${n(headline - target)}`)} />
          : <Button label={c('Set a calorie goal', 'حدّد هدف السعرات')} variant="text" onPress={() => router.push('/health')} />}
        {(view.kind === 'week' || view.kind === 'month') && <ColumnChart color={colors.primary} target={target}
          values={view.summary.days.map(d => d?.calories ?? null)} labels={view.summary.dates.map((d, i) => dayLabel(d, i, view.summary.dates.length))}
          label={c('Calories per day', 'السعرات لكل يوم')} rtl={ar} />}
        {view.kind === 'all' && <ColumnChart color={colors.primary} target={target} values={view.months.map(m => m.calories)}
          labels={view.months.map((m, i) => i % 2 === 1 ? new Date(`${m.month}-15T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { month: 'short' }) : null)}
          label={c('Average calories per logged day, by month', 'متوسط السعرات لكل يوم مسجّل، حسب الشهر')} rtl={ar} />}
      </Card></Animated.View>

      {/* Where the energy came from. */}
      <Animated.View entering={enter(1)}><Block icon="recipe" title={c('Macros', 'العناصر الغذائية')}>
        {share && <ShareBar parts={[{ value: share.protein, color: series.protein }, { value: share.carbs, color: series.carbs }, { value: share.fat, color: series.fat }]} />}
        {([['protein', c('Protein', 'البروتين'), avg!.proteinG, share?.protein], ['carbs', c('Carbs', 'الكربوهيدرات'), avg!.carbsG, share?.carbs], ['fat', c('Fat', 'الدهون'), avg!.fatG, share?.fat]] as const).map(([key, name, grams, pct]) =>
          <Property key={key} dot={series[key]} label={name} value={g(grams)} note={pct !== undefined ? `${pct}%` : undefined} />)}
        {view.goal.proteinTargetG ? <ProgressBar value={avg!.proteinG} max={view.goal.proteinTargetG} color={series.protein} start={c('Protein', 'البروتين')} end={c(`Goal ${view.goal.proteinTargetG} g`, `الهدف ${view.goal.proteinTargetG} غ`)} /> : null}
      </Block></Animated.View>

      {/* The rest of the day's story, as properties. */}
      <Animated.View entering={enter(2)}><Block icon="calendar" title={c('Habits', 'العادات')}>
        {view.kind !== 'today' && view.kind !== 'all' && <Property label={c('Days logged', 'الأيام المسجّلة')} value={`${loggedCount} / ${view.summary.dates.length}`} />}
        <Property label={c('Meals', 'الوجبات')} value={n(view.kind === 'all' ? view.meals : view.summary.meals)} />
        {data && <Property label={c('Streak', 'أيام متتالية')} value={c(`${streak(data.days, today)} ${streak(data.days, today) === 1 ? 'day' : 'days'}`, `${streak(data.days, today)} ${streak(data.days, today) === 1 ? 'يوم' : 'أيام'}`)} />}
        {view.kind !== 'all' && view.summary.best && <Property label={c('Closest to goal', 'الأقرب للهدف')} value={`${new Date(`${view.summary.best.date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'short', day: 'numeric', month: 'short' })} · ${n(view.summary.best.calories)} ${c('kcal', 'سعرة')}`} />}
        <Property label={c('Fibre', 'الألياف')} value={g(avg!.fiberG)} />
        <Property label={c('Sugar', 'السكر')} value={g(avg!.sugarG)} />
        <Property label={c('Sodium', 'الصوديوم')} value={mg(avg!.sodiumMg)} />
      </Block></Animated.View>

      {/* Day by day, newest first: a small table, like a database view. */}
      {(view.kind === 'week' || view.kind === 'month') && <Animated.View entering={enter(3)}><Block icon="list" title={c('Daily log', 'السجل اليومي')}>
        <TableRow cells={[c('Day', 'اليوم'), c('kcal', 'سعرة'), c('Protein', 'بروتين'), c('Meals', 'وجبات')]} header />
        {[...view.summary.logged].reverse().slice(0, allRows ? undefined : 7).map(d =>
          <TableRow key={d.date} cells={[new Date(`${d.date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'short', day: 'numeric', month: 'short' }), n(d.calories), g(d.proteinG), String(d.mealCount)]}
            highlight={target ? Math.abs(d.calories - target) > target * 0.1 : false} />)}
        {view.summary.logged.length > 7 && <Button label={allRows ? c('Show fewer', 'عرض أقل') : c(`Show all ${view.summary.logged.length}`, `عرض الكل (${view.summary.logged.length})`)} variant="text" onPress={() => setAllRows(!allRows)} />}
      </Block></Animated.View>}
    </>}

    {/* Health: weight and body, under every period. */}
    {data && <Animated.View entering={enter(4)}><Block icon="health" title={c('Health', 'الصحة')}>
      {trend ? <>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <AppText style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{kg(trend.latest)}</AppText>
          {trend.change !== null && <AppText variant="caption" style={{ color: goodChange(trend.change) === true ? colors.successText : goodChange(trend.change) === false ? colors.accentText : colors.textSecondary }}>
            {`${trend.change > 0 ? '+' : ''}${kg(trend.change)} ${windowStart ? c('in this period', 'في هذه الفترة') : c('since your first weigh-in', 'منذ أول وزن')}`}</AppText>}
        </View>
        <LineChart color={series.protein} unit={c('kg', 'كغ')} label={c('Weight over time', 'الوزن مع الوقت')}
          points={(windowStart && trend.points.length >= 2 ? trend.points : data.weights).map(w => ({ t: Date.parse(w.measuredAt), v: w.weightKg }))} />
      </> : <AppText muted>{c('Add your weight in Nutrition & preferences to follow it here.', 'أضف وزنك في التغذية والتفضيلات لتتابعه هنا.')}</AppText>}
      {body && <Property label="BMI" value={String(body.value)} note={bandNames[body.band]} />}
      <Property label={c('Goal', 'الهدف')} value={profileGoal ? c(...goalNames[profileGoal]) : c('Not set', 'غير محدد')} />
      {data.profile.goal?.targetWeightKg && <Property label={c('Target weight', 'الوزن المستهدف')} value={kg(Number(data.profile.goal.targetWeightKg))} />}
      <Property label={c('Allergies', 'الحساسيات')} value={String(data.profile.allergies.length)} />
      <Property label={c('Health conditions', 'الحالات الصحية')} value={String(data.profile.healthConditions.length)} />
      <Button label={c('Edit in Nutrition & preferences', 'تعديل في التغذية والتفضيلات')} variant="text" onPress={() => router.push('/health')} />
    </Block></Animated.View>}

    {/* A callout, Notion-style: where the numbers come from. */}
    <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: radii.md, backgroundColor: colors.surfaceMuted }}>
      <Icon name="info" size={18} color={colors.textSecondary} />
      <AppText variant="caption" muted style={uiStyles.grow}>{c('Totals come from meals you cook or log in Remi, using USDA values per ingredient. Days with nothing logged are left out of averages. Not medical advice.', 'الإجماليات من الوجبات التي تطبخها أو تسجّلها في ريمي، بقيم وزارة الزراعة الأمريكية لكل مكوّن. الأيام بلا تسجيل لا تدخل في المتوسطات. ليست نصيحة طبية.')}</AppText>
    </View>
  </Screen></SafeAreaView>;
}

/** A titled block on a card: an icon and heading, then its rows, the way a Notion page stacks blocks. */
function Block({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  const { colors } = useRemyTheme();
  return <Card style={{ gap: 12 }}>
    <View style={[uiStyles.row, { gap: 8 }]}><Icon name={icon} size={18} color={colors.textSecondary} /><AppText variant="heading">{title}</AppText></View>
    {children}
  </Card>;
}
/** A property row: grey label on the leading side, the value on the trailing side, a hairline between rows. */
function Property({ label, value, note, dot }: { label: string; value: string; note?: string; dot?: string }) {
  const { colors } = useRemyTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 8 }}>
    {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
    <AppText muted style={uiStyles.grow}>{label}</AppText>
    {note && <AppText variant="caption" muted>{note}</AppText>}
    <AppText variant="label" style={{ fontVariant: ['tabular-nums'] }}>{value}</AppText>
  </View>;
}
function TableRow({ cells, header, highlight }: { cells: string[]; header?: boolean; highlight?: boolean }) {
  const { colors } = useRemyTheme();
  return <View style={{ flexDirection: 'row', minHeight: header ? 28 : 36, alignItems: 'center', borderTopWidth: header ? 0 : 1, borderColor: colors.divider }}>
    {cells.map((cell, i) => <AppText key={i} variant={header ? 'caption' : 'body'} muted={header}
      style={{ flex: i === 0 ? 2 : 1, textAlign: i === 0 ? undefined : 'right', fontVariant: ['tabular-nums'], ...(highlight && i === 1 ? { color: colors.accentText } : {}) }}>{cell}</AppText>)}
  </View>;
}
