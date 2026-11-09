import { Gauge, HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, gaugeStyle, monospacedDigit, padding, scaleEffect, tint, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/** Today's rings as the app last saw them (progress as a fraction of each ring's target). */
// Plain numbers and booleans only: native code cannot take a null inside the props.
export type RemiRingsProps = { fuel: number; protein: number; fibre: number; closed: number; hasGoal: boolean; caloriesLeft: number; streak: number; arabic: boolean };

/**
 * Remi's home screen and Lock Screen widget. Widget code runs in an isolated runtime: no hooks, no imports at call
 * time and nothing from outside this function, so every colour and label lives inside it.
 */
const RemiRings = (props: RemiRingsProps, environment: WidgetEnvironment) => {
  'widget';
  const pink = '#FF4F9A', blue = '#7C8CFF', green = '#9BE15D', night = '#0E1440', mist = '#A9AECF';
  const ar = props.arabic;
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const left = props.caloriesLeft;
  const leftLine = !props.hasGoal ? t('Log a meal', 'سجّل وجبة') : left >= 0 ? t(`${left} kcal left`, `تبقّى ${left} سعرة`) : t(`${-left} kcal over`, `زيادة ${-left} سعرة`);
  const streakLine = props.streak === 1 ? t('1-day streak', 'يوم واحد متتالٍ') : t(`${props.streak}-day streak`, `${props.streak} أيام متتالية`);
  // Concentric rings from the system's capacity gauge, scaled out from the centre (Fuel outermost).
  const rings = (scale: number) => <ZStack>
    <Gauge value={Math.min(1, props.fuel)} modifiers={[gaugeStyle('circularCapacity'), tint(pink), scaleEffect(scale * 1.55)]} />
    <Gauge value={Math.min(1, props.protein)} modifiers={[gaugeStyle('circularCapacity'), tint(blue), scaleEffect(scale * 1.12)]} />
    <Gauge value={Math.min(1, props.fibre)} modifiers={[gaugeStyle('circularCapacity'), tint(green), scaleEffect(scale * 0.7)]} />
  </ZStack>;
  const link = widgetURL('remi-cookbook://nutrition');

  if (environment.widgetFamily === 'accessoryCircular') {
    return <ZStack modifiers={[containerBackground('clear', 'widget'), link]}>
      <Gauge value={Math.min(1, props.fuel)} modifiers={[gaugeStyle('circularCapacity')]} currentValueLabel={<Text>{`${props.closed}/3`}</Text>} />
    </ZStack>;
  }
  if (environment.widgetFamily === 'accessoryRectangular' || environment.widgetFamily === 'accessoryInline') {
    return <VStack alignment="leading" modifiers={[containerBackground('clear', 'widget'), link]}>
      <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>{t(`Remi · ${props.closed}/3 rings`, `ريمي · ${props.closed}/٣ حلقات`)}</Text>
      <Text modifiers={[font({ size: 13 }), monospacedDigit()]}>{leftLine}</Text>
      <Text modifiers={[font({ size: 13 })]}>{streakLine}</Text>
    </VStack>;
  }
  if (environment.widgetFamily === 'systemMedium') {
    const row = (label: string, value: number, color: string) => <HStack spacing={6}>
      <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(color)]}>{label}</Text>
      <Spacer />
      <Text modifiers={[font({ weight: 'bold', size: 15 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>{`${Math.round(Math.min(9.99, value) * 100)}%`}</Text>
    </HStack>;
    return <HStack spacing={18} modifiers={[containerBackground(night, 'widget'), padding({ all: 4 }), link]}>
      <ZStack modifiers={[frame({ width: 120, height: 120 })]}>{rings(1.45)}</ZStack>
      <VStack alignment="leading" spacing={7}>
        {row(t('Fuel', 'الطاقة'), props.fuel, pink)}
        {row(t('Protein', 'البروتين'), props.protein, blue)}
        {row(t('Fibre', 'الألياف'), props.fibre, green)}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(mist)]}>{`${leftLine} · ${streakLine}`}</Text>
      </VStack>
    </HStack>;
  }
  // systemSmall: the rings, and the one number that matters next.
  return <VStack spacing={10} modifiers={[containerBackground(night, 'widget'), link]}>
    <ZStack modifiers={[frame({ width: 96, height: 96 })]}>{rings(1.15)}</ZStack>
    <VStack spacing={1}>
      <Text modifiers={[font({ weight: 'bold', size: 14 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>{leftLine}</Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(mist)]}>{streakLine}</Text>
    </VStack>
  </VStack>;
};

export default createWidget<RemiRingsProps>('RemiRings', RemiRings, { fuel: 0, protein: 0, fibre: 0, closed: 0, hasGoal: false, caloriesLeft: 0, streak: 0, arabic: false });
