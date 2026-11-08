import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useIncomingShare } from 'expo-sharing';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { AppText, Button, Card, uiStyles } from '@/components/ui/core';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { RecipeArt } from '@/components/recipe-card';
import { useLanguage } from '@/providers/language-provider';
import { useRemyTheme } from '@/theme/provider';
import { radii, spacing } from '@/theme/tokens';
import { firstUrl, linkedByDefault, saveInput, textDir, type RecipeImportPreview } from '@/domain/recipe-import';
import { previewRecipeImport, saveImportedRecipe } from '@/services/recipe-import-api';
import { IntakeShell, intakeError } from './intake-shell';

const copy = {
  en: {
    title: 'Save a recipe', intro: 'Paste a link from a recipe site, or share a page to Remi from Safari, Chrome or any app. Remi reads the recipe and keeps it in My recipes.',
    link: 'Recipe link', paste: 'Paste', read: 'Read recipe', reading: 'Reading the page…',
    works: 'Works with sites that publish recipe details, as most recipe sites and food blogs do. Video posts without a written recipe can’t be read.',
    from: (site: string) => `From ${site}`, by: (name: string) => `by ${name}`, servings: 'Servings', minutes: (n: number) => `${n} min`,
    already: 'You already saved this recipe.', openSaved: 'Open it', saveAnyway: 'Save another copy',
    ingredients: 'Ingredients', linkHint: 'Ticked ingredients are linked to Remi’s food list, so they count for nutrition, your kitchen and shopping. Every line is saved as written.',
    linkedTo: (food: string) => `Linked to ${food}`, suggest: (food: string) => `Link to ${food}?`, textOnly: 'Kept as written',
    steps: 'Steps', more: (n: number) => `and ${n} more`, save: 'Save to My recipes', saving: 'Saving…', another: 'Read a different link',
    nameLabel: 'Recipe name',
  },
  ar: {
    title: 'حفظ وصفة', intro: 'الصق رابطًا من موقع وصفات، أو شارك صفحة إلى ريمي من سفاري أو كروم أو أي تطبيق. يقرأ ريمي الوصفة ويحفظها في وصفاتي.',
    link: 'رابط الوصفة', paste: 'لصق', read: 'قراءة الوصفة', reading: 'جارٍ قراءة الصفحة…',
    works: 'يعمل مع المواقع التي تنشر تفاصيل الوصفة، كما تفعل معظم مواقع الوصفات والمدونات. لا يمكن قراءة منشورات الفيديو بلا وصفة مكتوبة.',
    from: (site: string) => `من ${site}`, by: (name: string) => `بواسطة ${name}`, servings: 'الحصص', minutes: (n: number) => `${n.toLocaleString('ar')} دقيقة`,
    already: 'حفظت هذه الوصفة من قبل.', openSaved: 'فتحها', saveAnyway: 'حفظ نسخة أخرى',
    ingredients: 'المكونات', linkHint: 'المكونات المحددة مرتبطة بقائمة أطعمة ريمي، فتُحتسب في القيم الغذائية ومطبخك والمشتريات. يُحفظ كل سطر كما هو مكتوب.',
    linkedTo: (food: string) => `مرتبط بـ ${food}`, suggest: (food: string) => `ربط بـ ${food}؟`, textOnly: 'يُحفظ كما هو مكتوب',
    steps: 'الخطوات', more: (n: number) => `و${n.toLocaleString('ar')} أخرى`, save: 'حفظ في وصفاتي', saving: 'جارٍ الحفظ…', another: 'قراءة رابط آخر',
    nameLabel: 'اسم الوصفة',
  },
};

export default function ImportRecipeScreen() {
  const { language } = useLanguage();
  return <IntakeShell title={copy[language].title}><ImportBody /></IntakeShell>;
}

function ImportBody() {
  const { language } = useLanguage(); const t = copy[language]; const ar = language === 'ar';
  const { colors } = useRemyTheme(); const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ url?: string; shared?: string }>();
  const share = useIncomingShare();
  const [url, setUrl] = useState(params.url ?? '');
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<RecipeImportPreview | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState(4);
  const [linked, setLinked] = useState<Set<number>>(new Set());
  const started = useRef(false);

  const read = async (link: string) => {
    const target = firstUrl(link) ?? link.trim();
    if (!target || busy) return;
    setBusy('reading'); setError(''); setPreview(null); setUrl(target);
    try {
      const result = await previewRecipeImport(target);
      setPreview(result); setName(result.name); setServings(result.servings ?? 4);
      setLinked(new Set(result.ingredients.flatMap((ingredient, index) => linkedByDefault(ingredient) ? [index] : [])));
    } catch (failure) { setError(intakeError(failure)); }
    finally { setBusy(''); }
  };
  // A link handed over by the share sheet or a deep link is read straight away.
  useEffect(() => {
    if (started.current) return;
    const shared = share.sharedPayloads.map(payload => firstUrl(payload.value)).find(Boolean);
    const incoming = shared ?? (params.url ? firstUrl(params.url) : null);
    // Read after this render settles rather than setting state inside the effect.
    if (incoming) { started.current = true; if (shared) share.clearSharedPayloads(); queueMicrotask(() => { void read(incoming); }); }
  }, [share.sharedPayloads, params.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!preview || busy) return;
    setBusy('saving'); setError('');
    try {
      const recipe = await saveImportedRecipe(saveInput(preview, { name, servings, linked }));
      router.replace({ pathname: '/recipes/[id]', params: { id: recipe.id } });
    } catch (failure) { setError(intakeError(failure)); setBusy(''); }
  };
  const toggle = (index: number) => setLinked(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const enter = reduced ? undefined : FadeInDown.duration(260);

  if (!preview) return <>
    <AppText muted>{t.intro}</AppText>
    <View style={{ gap: spacing.sm }}>
      <FormField label={t.link} value={url} onChangeText={setUrl} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" inputDirection="ltr"
        editable={!busy} onSubmitEditing={() => { void read(url); }} />
      <View style={uiStyles.wrap}>
        <Button label={busy === 'reading' ? t.reading : t.read} disabled={!url.trim() || busy !== ''} onPress={() => { void read(url); }} />
        <Button label={t.paste} variant="secondary" disabled={busy !== ''} onPress={() => { void Clipboard.getStringAsync().then(text => { const link = firstUrl(text); if (link) { setUrl(link); void read(link); } else setUrl(text.trim()); }); }} />
      </View>
    </View>
    {error !== '' && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{error}</AppText>}
    <AppText variant="caption" muted>{t.works}</AppText>
  </>;

  const minutes = (preview.prepTimeMin ?? 0) + (preview.cookTimeMin ?? 0);
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} style={{ gap: spacing.xl }}>
    <View style={{ gap: spacing.md }}>
      <RecipeArt id={preview.sourceUrl} name={preview.name} width="100%" height={220} uri={preview.imageUrl} />
      <View style={{ gap: 4 }}>
        <FormField label={t.nameLabel} value={name} onChangeText={setName} editable={!busy} inputDirection={textDir(name)} />
        <AppText variant="caption" muted>{[preview.sourceName && t.from(preview.sourceName), preview.author && t.by(preview.author), minutes ? t.minutes(minutes) : null].filter(Boolean).join(' · ')}</AppText>
      </View>
      <View style={[uiStyles.row, { gap: spacing.md }]}>
        <AppText variant="label" style={uiStyles.grow}>{t.servings}</AppText>
        <Stepper value={servings} onChange={setServings} disabled={busy !== ''} />
      </View>
    </View>
    {preview.savedRecipeId && <Card style={{ gap: spacing.sm, backgroundColor: colors.warningSurface }}>
      <AppText style={{ color: colors.warningText }}>{t.already}</AppText>
      <Button label={t.openSaved} variant="secondary" onPress={() => router.replace({ pathname: '/recipes/[id]', params: { id: preview.savedRecipeId! } })} />
    </Card>}
    <Animated.View entering={enter} style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">{t.ingredients}</AppText>
      <AppText variant="caption" muted>{t.linkHint}</AppText>
      {preview.ingredients.map((ingredient, index) => {
        const canLink = !!ingredient.food && ingredient.quantity !== null && ingredient.unit !== null;
        const on = linked.has(index);
        const food = ingredient.food ? (ar && ingredient.food.arabicName ? ingredient.food.arabicName : ingredient.food.name) : '';
        const status = on ? t.linkedTo(food) : canLink && ingredient.confidence !== 'NONE' ? t.suggest(food) : t.textOnly;
        return <Pressable key={index} disabled={!canLink || busy !== ''} onPress={() => toggle(index)} accessibilityRole={canLink ? 'checkbox' : undefined} accessibilityState={canLink ? { checked: on } : undefined}
          accessibilityLabel={`${ingredient.text}. ${status}`} style={({ pressed }) => [uiStyles.row, { gap: spacing.md, alignItems: 'flex-start', opacity: pressed ? 0.7 : 1 }]}>
          <View style={{ width: 24, height: 24, marginTop: 1, borderRadius: radii.sm, borderWidth: canLink ? 2 : 0, alignItems: 'center', justifyContent: 'center',
            borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : canLink ? 'transparent' : colors.divider }}>
            {on && <Icon name="check" size={16} color={colors.onPrimary} />}
          </View>
          <View style={[uiStyles.grow, { gap: 2 }]}>
            <AppText dir={textDir(ingredient.text)} style={{ textAlign: textDir(ingredient.text) === 'rtl' ? 'right' : 'left' }}>{ingredient.text}</AppText>
            <AppText variant="caption" style={{ color: on ? colors.successText : colors.textSecondary }}>{status}</AppText>
          </View>
        </Pressable>;
      })}
    </Animated.View>
    {preview.steps.length > 0 && <View style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header">{t.steps}</AppText>
      {preview.steps.slice(0, 3).map((step, index) => <View key={index} style={[uiStyles.row, { gap: spacing.md, alignItems: 'flex-start' }]}>
        <AppText variant="label" style={{ width: 20, color: colors.textSecondary }}>{index + 1}</AppText>
        <AppText dir={textDir(step)} style={[uiStyles.grow, { textAlign: textDir(step) === 'rtl' ? 'right' : 'left' }]} numberOfLines={4}>{step}</AppText>
      </View>)}
      {preview.steps.length > 3 && <AppText muted>{t.more(preview.steps.length - 3)}</AppText>}
    </View>}
    {error !== '' && <AppText accessibilityRole="alert" style={{ color: colors.errorText }}>{error}</AppText>}
    <View style={{ gap: spacing.sm }}>
      <Button label={busy === 'saving' ? t.saving : preview.savedRecipeId ? t.saveAnyway : t.save} disabled={busy !== '' || !name.trim()} onPress={() => { void save(); }} />
      <Button label={t.another} variant="text" disabled={busy !== ''} onPress={() => { setPreview(null); setError(''); }} />
    </View>
  </Animated.View>;
}

function Stepper({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled: boolean }) {
  const { colors } = useRemyTheme();
  const round = (label: string, next: number, a11y: string, off: boolean) => <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={off} onPress={() => onChange(next)} hitSlop={6}
    style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: off ? colors.disabledSurface : pressed ? colors.primaryPressed : colors.primary })}>
    <AppText variant="heading" style={{ color: off ? colors.disabledText : colors.onPrimary, lineHeight: 24 }}>{label}</AppText></Pressable>;
  return <View style={[uiStyles.row, { gap: 12 }]}>
    {round('−', value - 1, 'Fewer servings', disabled || value <= 1)}
    <AppText variant="heading" accessibilityLiveRegion="polite" style={{ minWidth: 28, textAlign: 'center' }}>{value}</AppText>
    {round('+', value + 1, 'More servings', disabled || value >= 100)}
  </View>;
}
