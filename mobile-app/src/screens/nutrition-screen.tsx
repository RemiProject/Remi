import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { AppText, Button, Card, EmptyState, PageHeader, Screen, SectionHeader, TextTabs, uiStyles } from '@/components/ui/core';
import { ActivityRings, Medal, useRingColors } from '@/components/activity-rings';
import { awards, forgivingStreak, ringsFor, type Award, type RingKey } from '@/domain/nutrition-rings';
import { feedback } from '@/services/feedback';
import { syncRemiWidget } from '@/services/remi-widget';
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
  const { colors } = useRemyTheme(); const reduced = useReducedMotion();
  const c = (en: string, arabic: string) => ar ? arabic : en;
  const [period, setPeriod] = useState<Period>('week');
  const [allRows, setAllRows] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // a day picked in the week strip; null is today
  const [cheer, setCheer] = useState<string | null>(null);
  const today = todayKey();
  const state = useKitchenData(() => load(today), 'nutrition');
  // The recipe page's macro mapping, so a colour means the same nutrient everywhere.
  const series = { protein: colors.macroProtein, carbs: colors.macroCarbs, fat: colors.macroFat };
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

  // The rings, the streak and the awards: the daily game, built to reward balance and showing up.
  const game = useMemo(() => {
    if (!state.data) return null;
    const goal = { calorieTarget: state.data.profile.goal?.calorieTarget ?? null, proteinTargetG: state.data.profile.goal?.proteinTargetG ?? null };
    const byDate = new Map(state.data.days.filter(d => d.mealCount > 0).map(d => [d.date, d]));
    const week = periodDates(today, 'week').map(date => ({ date, rings: ringsFor(byDate.get(date) ?? null, goal) }));
    return { goal, byDate, week, today: ringsFor(byDate.get(today) ?? null, goal), streak: forgivingStreak(state.data.days, today), awards: awards(state.data.days, goal) };
  }, [state.data, today]);

  // Celebrate what is new since the last look: a ring closing today, or an award. One cue, then it is remembered.
  useEffect(() => {
    if (!game || !user) return;
    let live = true;
    const key = `remi.rings.seen.v1:${user.id}`;
    void AsyncStorage.getItem(key).then(raw => {
      if (!live) return;
      const seen = raw ? JSON.parse(raw) as { date: string; rings: RingKey[]; awards: string[] } : null;
      const closed = game.today.filter(r => r.closed).map(r => r.key), earned = game.awards.filter(a => a.earned).map(a => a.id);
      const newRings = seen?.date === today ? closed.filter(k => !seen.rings.includes(k)) : seen ? closed : [];
      const newAwards = seen ? earned.filter(id => !seen.awards.includes(id)) : []; // the first visit records quietly
      const award = game.awards.find(a => a.id === newAwards[0]);
      const ringName = { fuel: c('Fuel', 'الطاقة'), protein: c('Protein', 'البروتين'), fibre: c('Fibre', 'الألياف') };
      if (award) { feedback.success(); setCheer(c(`New award: ${award.en[0]}`, `وسام جديد: ${award.ar[0]}`)); }
      else if (newRings.length) { feedback.success(); setCheer(closed.length === 3 ? c('All three rings closed today!', 'أغلقت الحلقات الثلاث اليوم!') : c(`${ringName[newRings[0]]} ring closed.`, `أغلقت حلقة ${ringName[newRings[0]]}.`)); }
      void AsyncStorage.setItem(key, JSON.stringify({ date: today, rings: closed, awards: earned }));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [game, user, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // The home screen widget shows today's rings; refresh it whenever fresh numbers arrive.
  useEffect(() => {
    if (!game) return;
    const t = game.today, fuel = t[0];
    syncRemiWidget({ fuel: Math.min(1.5, fuel.progress), protein: Math.min(1.5, t[1].progress), fibre: Math.min(1.5, t[2].progress), closed: t.filter(r => r.closed).length,
      hasGoal: !!game.goal.calorieTarget, caloriesLeft: game.goal.calorieTarget ? Math.round(game.goal.calorieTarget - (game.byDate.get(today)?.calories ?? 0)) : 0,
      streak: game.streak.days, arabic: ar });
  }, [game, ar, today]);

  const tabs = [{ key: 'today', label: c('Today', 'اليوم') }, { key: 'week', label: c('7 days', '٧ أيام') }, { key: 'month', label: c('30 days', '٣٠ يومًا') }, { key: 'all', label: c('All time', 'كل الوقت') }];
  const enter = (i: number) => reduced ? undefined : FadeInDown.duration(260).delay(i * 50);

  if (ready && !user) return <View style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={c('Nutrition', 'التغذية')} />
    <EmptyState title={c('Your eating, at a glance.', 'طعامك في لمحة.')} description={c('Sign in to see your days, weeks and months.', 'سجّل الدخول لترى أيامك وأسابيعك وأشهرك.')} action={c('Sign in', 'تسجيل الدخول')} onPress={() => router.push('/login')} />
  </Screen></View>;

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

  const ringSummary = (closed: number) => closed === 3 ? c('All three rings closed today. Lovely.', 'أغلقت الحلقات الثلاث اليوم. رائع.')
    : c(`${closed} of 3 rings closed today.`, `${closed} من ٣ حلقات مغلقة اليوم.`);
  // Medals in the brand's three colours, each with the ink or white that reads on it.
  const medalColor = (a: Award) => ({ flame: [colors.accent, colors.onAccent], rings: [colors.primary, colors.onPrimary], health: [colors.hero, colors.onHero], recipe: [colors.hero, colors.onHero], award: [colors.primary, colors.onPrimary] } as const)[a.icon];

  return <View style={{ flex: 1, backgroundColor: colors.background }}><Screen rtl={ar}>
    <PageHeader title={c('Nutrition', 'التغذية')} action={logFood} subtitle={game ? ringSummary(game.today.filter(r => r.closed).length) : undefined} />
    {cheer && <Animated.View key={cheer} entering={reduced ? undefined : FadeInDown.springify().damping(14)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.accentSoft }}>
      <Icon name="award" size={22} color={colors.accentText} /><AppText variant="label" style={[uiStyles.grow, { color: colors.accentText }]}>{cheer}</AppText>
      <Button label={c('Nice', 'رائع')} variant="text" onPress={() => setCheer(null)} />
    </Animated.View>}

    {game && <Animated.View entering={enter(0)}><RingsHero game={game} selected={selected ?? today} today={today} onSelect={date => setSelected(date === today ? null : date)} ar={ar} c={c} /></Animated.View>}

    {game && <Animated.View entering={enter(1)}><Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft }}><Icon name="flame" size={26} color={colors.accentText} /></View>
      <View style={uiStyles.grow}>
        <AppText variant="figure" style={{ fontSize: 28, lineHeight: 32 }}>{game.streak.days} <AppText muted>{c('day streak', game.streak.days === 1 ? 'يوم متتالٍ' : 'أيام متتالية')}</AppText></AppText>
        <AppText variant="caption" muted>{game.streak.restUsed ? c('Rest day used this week. Log today to keep going.', 'استخدمت يوم الراحة هذا الأسبوع. سجّل اليوم لتستمر.') : c('One rest day a week is on us.', 'يوم راحة واحد في الأسبوع لا يكسر السلسلة.')}</AppText>
      </View>
      <View style={{ alignItems: 'center' }}><AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{game.awards.filter(a => a.earned).length}/{game.awards.length}</AppText><AppText variant="caption" muted>{c('awards', 'أوسمة')}</AppText></View>
    </Card></Animated.View>}

    {game && <Animated.View entering={enter(2)}><Block icon="award" title={c('Awards', 'الأوسمة')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {game.awards.map(a => <Medal key={a.id} award={a} title={ar ? a.ar[0] : a.en[0]} note={a.earned ? (ar ? a.ar[1] : a.en[1]) : c(`${a.have} / ${a.need}`, `${a.have} من ${a.need}`)}
          color={medalColor(a)[0]} onColor={medalColor(a)[1]} muted={colors.surfaceMuted} ink={colors.textSecondary} />)}
      </View>
    </Block></Animated.View>}

    <View style={{ gap: 4 }}><SectionHeader title={c('Trends', 'الاتجاهات')} />{finding ? <AppText muted>{finding}</AppText> : null}</View>
    <TextTabs tabs={tabs} value={period} onChange={key => setPeriod(key as Period)} rtl={ar} />
    <DataNotice {...state} />
    {view && !loggedCount && <EmptyState title={c('Nothing here yet.', 'لا شيء هنا بعد.')} description={c('Cook a recipe in Remi or log food you ate out, and your days fill in.', 'اطبخ وصفة في ريمي أو سجّل طعامًا أكلته خارج المنزل، وستمتلئ أيامك.')} />}

    {view && loggedCount > 0 && <>
      {/* The answer: calories against the goal, then how the days went. */}
      <Animated.View entering={enter(0)}><Card style={{ gap: 14 }}>
        <AppText variant="caption" muted>{view.kind === 'today' ? c('Eaten today', 'المتناول اليوم') : c('Average per logged day', 'المتوسط لكل يوم مسجّل')}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <AppText variant="figure">{n(headline)}</AppText>
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
          <AppText variant="figure" style={{ fontSize: 26, lineHeight: 30 }}>{kg(trend.latest)}</AppText>
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
  </Screen></View>;
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

type Game = { goal: { calorieTarget: number | null; proteinTargetG: number | null }; byDate: Map<string, DayTotals>; week: { date: string; rings: ReturnType<typeof ringsFor> }[]; today: ReturnType<typeof ringsFor> };
/**
 * The rings on a night panel, like a watch face: big rings for the chosen day with their numbers beside them, then the
 * week as small rings to tap through. The panel stays dark in both themes so the ring colours glow.
 */
function RingsHero({ game, selected, today, onSelect, ar, c }: { game: Game; selected: string; today: string; onSelect: (date: string) => void; ar: boolean; c: (en: string, arabic: string) => string }) {
  const { colors } = useRemyTheme(); const ringColors = useRingColors();
  const ink = colors.onHero, mist = colors.onHeroMuted;
  const rings = game.week.find(d => d.date === selected)?.rings ?? game.today;
  const fmt = (v: number) => Math.round(v).toLocaleString('en');
  const names: Record<RingKey, string> = { fuel: c('Fuel', 'الطاقة'), protein: c('Protein', 'البروتين'), fibre: c('Fibre', 'الألياف') };
  const unit = (key: RingKey) => key === 'fuel' ? (game.goal.calorieTarget ? c('kcal', 'سعرة') : c('meals', 'وجبات')) : c('g', 'غ');
  const dayName = selected === today ? c('Today', 'اليوم') : new Date(`${selected}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'long', day: 'numeric', month: 'short' });
  // The rings live on the app's hero surface (lemon in light, cobalt in dark), like Home's header.
  return <View style={{ backgroundColor: colors.hero, borderRadius: 28, padding: 20, gap: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <ActivityRings key={selected} rings={rings} size={148} stroke={17} label={rings.map(r => `${names[r.key]} ${fmt(r.value)} / ${fmt(r.target)}`).join(', ')} />
      <View style={{ flex: 1, gap: 12 }}>
        <AppText variant="caption" style={{ color: mist }}>{dayName}</AppText>
        {rings.map(r => <View key={r.key} style={{ gap: 1 }}>
          {/* The ring's colour lives in its dot; the words stay in ink so they read on the hero. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ringColors[r.key] }} />
            <AppText variant="label" style={{ color: ink, fontSize: 14 }}>{names[r.key]}{r.closed ? ' ✓' : r.over ? c(' · over', ' · تجاوز') : ''}</AppText>
          </View>
          <AppText variant="figure" style={{ color: ink, fontSize: 22, lineHeight: 26 }}>{fmt(r.value)}<AppText style={{ color: mist, fontSize: 14 }}>{` / ${fmt(r.target)} ${unit(r.key)}`}</AppText></AppText>
        </View>)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {game.week.map(d => { const on = d.date === selected;
        return <Pressable key={d.date} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={new Date(`${d.date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'long' })}
          onPress={() => { if (!on) feedback.select(); onSelect(d.date); }} hitSlop={4}
          style={{ alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 14, backgroundColor: on ? `${ink}1A` : 'transparent' }}>
          <AppText variant="caption" style={{ color: on ? ink : mist, fontSize: 12 }}>{new Date(`${d.date}T12:00:00`).toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'narrow' })}</AppText>
          <ActivityRings rings={d.rings} size={34} stroke={4} animate={false} />
        </Pressable>; })}
    </View>
  </View>;
}
