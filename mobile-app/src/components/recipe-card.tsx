import { useLanguage } from '@/providers/language-provider';
import { recipeName } from '@/i18n/recipe-names';
import { catalogLabel } from '@/i18n/catalog-labels';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { AppText } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { getCookbookContent } from '@/data/cookbook-content';
import { recipeImages } from '@/data/food-images';
import { useRemyTheme } from '@/theme/provider';
import { layout, radii } from '@/theme/tokens';
import { LABEL_RULES, LIGHT_KCAL, nutritionComplete, nutritionCopy, type RecipeNutrition } from '@/domain/nutrition';

const GAP = 12;
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
/** Card width for a 2-column grid inside the standard 20 pt screen gutter. */
export function useGridCardWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, layout.maxWidth) - 40 - GAP) / 2);
}

/** Catalogue photo by recipe name (the catalogue importer keys global recipes by name), then the bundled cookbook photo. */
export const recipeImage = (name: string, id?: string): number | undefined =>
  recipeImages[name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()] ?? getCookbookContent(name, id)?.image;

/** The recipe's photo, or a typographic tile (its initial on a pale brand field) when it has none. */
export function RecipeArt({ id, name, width, height, radius = radii.lg, uri }: { id: string; name: string; width: number | '100%'; height: number; radius?: number; uri?: string | null }) {
  const { colors } = useRemyTheme();
  const { language } = useLanguage();
  const title = recipeName(name, language);
  // A saved recipe brings its own photo from the page it came from.
  const photo = recipeImage(name, id) ?? (uri ? { uri } : undefined);
  if (photo) return <Image source={photo} accessibilityLabel={title} contentFit="cover" style={{ width, height, borderRadius: radius }} />;
  const fields = [[colors.surfaceMuted, colors.primary], [colors.accentSoft, colors.accentText], [colors.primarySoft, colors.primary]] as const;
  // FNV-1a over the id: UUIDs share prefixes, so a plain character sum clusters on one colour.
  const [ground, ink] = fields[[...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % fields.length];
  const initial = (title.match(/\p{L}/u)?.[0] ?? '·').toLocaleUpperCase();
  return <View accessibilityRole="image" accessibilityLabel={title} style={{ width, height, borderRadius: radius, backgroundColor: ground, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <AppText variant="title" style={{ color: ink, fontSize: height * 0.4, lineHeight: height * 0.5 }}>{initial}</AppText>
  </View>;
}

export function RecipeCard({ id, name, time, caption, energy, note, details = [], extra, textDir, width, image, onPress }: {
  id: string; name: string; image?: string | null; time: string | null; caption?: string; energy?: string | null; note?: string | null; details?: (string | null | undefined)[]; extra?: React.ReactNode; textDir?: 'rtl' | 'ltr'; width: number; onPress: () => void;
}) {
  const { colors } = useRemyTheme(); const reduced = useReducedMotion();
  const { language } = useLanguage();
  const title = recipeName(name, language);
  // Press feedback on press-in, as a CSS transition: twice per tap, never per frame.
  const [pressed, setPressed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={[title, time, caption && catalogLabel(caption, language), energy, ...details, note].filter(Boolean).join('. ')} onPress={onPress}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} pressRetentionOffset={16} style={{ width }}>
    <Animated.View style={{ gap: 8, transform: [{ scale: pressed && !reduced ? 0.97 : 1 }], transitionProperty: 'transform', transitionDuration: '120ms', transitionTimingFunction: EASE_OUT }}>
    <View>
      <RecipeArt id={id} name={name} width={width} height={Math.round(width * 0.8)} uri={image} />
      {time && <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.surface }}>
        <Icon name="clock" size={12} color={colors.textSecondary} /><AppText variant="caption" style={{ fontSize: 12, lineHeight: 16, color: colors.text }}>{time}</AppText>
      </View>}
    </View>
    <View style={{ gap: 2 }}>
      <AppText variant="label" numberOfLines={2} dir={title === name ? 'ltr' : 'rtl'}>{title}</AppText>
      {(caption || energy) && <AppText variant="caption" muted numberOfLines={1} dir={textDir}>{[caption && catalogLabel(caption, language), energy].filter(Boolean).join(' · ')}</AppText>}
      {details.filter(Boolean).map(line => <AppText key={line} variant="caption" muted numberOfLines={2} dir={textDir}>{line}</AppText>)}
      {note && <AppText variant="caption" numberOfLines={2} dir={textDir} style={{ color: colors.accentText }}>{note}</AppText>}
      {extra}
    </View>
    </Animated.View>
  </Pressable>;
}

/**
 * Two columns of recipe cards. The first batch of cards fades up once, staggered, when the grid first fills (the
 * content the person opened the screen for). Later changes, such as switching tabs, appear at once: they happen
 * too often to animate.
 */
export function RecipeGrid({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const items = ([children].flat(Infinity) as React.ReactNode[]).filter(child => child !== null && child !== undefined && child !== false);
  const [settled, setSettled] = useState(false);
  useEffect(() => { if (items.length && !settled) queueMicrotask(() => setSettled(true)); }, [items.length, settled]);
  const animate = !reduced && !settled;
  // The wrapper is always there, so cards never remount when the entrance stops applying.
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 24 }}>
    {items.map((child, index) => <GridEntrance key={(child as { key?: string }).key ?? index} index={index} animate={animate && index < 8}>{child}</GridEntrance>)}
  </View>;
}
function GridEntrance({ index, animate, children }: { index: number; animate: boolean; children: React.ReactNode }) {
  const entering = useMemo(() => FadeInDown.duration(220).delay(index * 40), [index]);
  return <Animated.View entering={animate ? entering : undefined}>{children}</Animated.View>;
}

/** The cookbook's tabs are the shared text tabs. */
export { TextTabs as RecipeTabs } from '@/components/ui/core';

/** All, Quick, High protein, Under 500 kcal (when `min` recipes qualify), then the most common cuisines, most common first. */
export function recipeTabs(recipes: readonly { cuisineName?: string | null; nutrition?: RecipeNutrition | null; householdId?: string | null }[], copy: (en: string, ar: string) => string, max = 6, min = 5) {
  const counts = new Map<string, number>();
  for (const recipe of recipes) if (recipe.cuisineName) counts.set(recipe.cuisineName, (counts.get(recipe.cuisineName) ?? 0) + 1);
  const cuisines = [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, max).map(([name]) => ({ key: `cuisine:${name}`, label: copy(name, catalogLabel(name, 'ar')) }));
  const nutrition = [
    { key: 'protein', label: copy(nutritionCopy.en.tabs.protein, nutritionCopy.ar.tabs.protein) },
    { key: 'light', label: copy(nutritionCopy.en.tabs.light, nutritionCopy.ar.tabs.light) },
  ].filter(tab => filterRecipes(recipes.map(r => ({ prepTimeMin: null, cookTimeMin: null, ...r })), tab.key).length >= min);
  const mine = recipes.some(recipe => recipe.householdId) ? [{ key: 'mine', label: copy('My recipes', 'وصفاتي') }] : [];
  return [{ key: 'all', label: copy('All', 'الكل') }, ...mine, { key: 'quick', label: copy('Quick', 'سريعة') }, ...nutrition, ...cuisines];
}
export const recipeMinutes = (recipe: { prepTimeMin: number | null; cookTimeMin: number | null }) => recipe.prepTimeMin === null && recipe.cookTimeMin === null ? null : (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0);
export function filterRecipes<T extends { cuisineName?: string | null; prepTimeMin: number | null; cookTimeMin: number | null; nutrition?: RecipeNutrition | null; householdId?: string | null }>(recipes: readonly T[], tab: string): T[] {
  if (tab === 'mine') return recipes.filter(recipe => recipe.householdId);
  if (tab === 'quick') return recipes.filter(recipe => { const m = recipeMinutes(recipe); return m !== null && m <= 30; });
  // Complete data only: a partial total would undercount and wrongly pass.
  if (tab === 'protein') return recipes.filter(recipe => nutritionComplete(recipe.nutrition) && LABEL_RULES['high-protein'](recipe.nutrition));
  if (tab === 'light') return recipes.filter(recipe => nutritionComplete(recipe.nutrition) && recipe.nutrition.calories <= LIGHT_KCAL);
  if (tab.startsWith('cuisine:')) return recipes.filter(recipe => recipe.cuisineName === tab.slice(8));
  return [...recipes];
}
