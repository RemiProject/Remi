import { Image } from 'expo-image';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { getCookbookContent } from '@/data/cookbook-content';
import { recipeImages } from '@/data/food-images';
import { useRemyTheme } from '@/theme/provider';
import { layout, radii } from '@/theme/tokens';

const GAP = 12;
/** Card width for a 2-column grid inside the standard 20 pt screen gutter. */
export function useGridCardWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, layout.maxWidth) - 40 - GAP) / 2);
}

/** Catalogue photo by recipe name (the catalogue importer keys global recipes by name), then the bundled cookbook photo. */
export const recipeImage = (name: string, id?: string): number | undefined =>
  recipeImages[name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()] ?? getCookbookContent(name, id)?.image;

/** The recipe's photo, or a typographic tile (its initial on a pale brand field) when it has none. */
export function RecipeArt({ id, name, width, height, radius = radii.lg }: { id: string; name: string; width: number | '100%'; height: number; radius?: number }) {
  const { colors } = useRemyTheme();
  const photo = recipeImage(name, id);
  if (photo) return <Image source={photo} accessibilityLabel={name} contentFit="cover" style={{ width, height, borderRadius: radius }} />;
  const fields = [[colors.surfaceMuted, colors.primary], [colors.accentSoft, colors.accentText], [colors.primarySoft, colors.primary]] as const;
  // FNV-1a over the id: UUIDs share prefixes, so a plain character sum clusters on one colour.
  const [ground, ink] = fields[[...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % fields.length];
  const initial = (name.match(/\p{L}/u)?.[0] ?? '·').toLocaleUpperCase();
  return <View accessibilityRole="image" accessibilityLabel={name} style={{ width, height, borderRadius: radius, backgroundColor: ground, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <AppText variant="title" style={{ color: ink, fontSize: height * 0.4, lineHeight: height * 0.5 }}>{initial}</AppText>
  </View>;
}

export function RecipeCard({ id, name, time, caption, note, details = [], extra, textDir, width, onPress }: {
  id: string; name: string; time: string | null; caption?: string; note?: string | null; details?: (string | null | undefined)[]; extra?: React.ReactNode; textDir?: 'rtl' | 'ltr'; width: number; onPress: () => void;
}) {
  const { colors } = useRemyTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={[name, time, caption, ...details, note].filter(Boolean).join('. ')} onPress={onPress}
    style={({ pressed }) => ({ width, gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
    <View>
      <RecipeArt id={id} name={name} width={width} height={Math.round(width * 0.8)} />
      {time && <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.surface }}>
        <Icon name="clock" size={12} color={colors.textSecondary} /><AppText variant="caption" style={{ fontSize: 12, lineHeight: 16, color: colors.text }}>{time}</AppText>
      </View>}
    </View>
    <View style={{ gap: 2 }}>
      <AppText variant="label" numberOfLines={2} dir="ltr">{name}</AppText>
      {caption && <AppText variant="caption" muted numberOfLines={1} dir={textDir}>{caption}</AppText>}
      {details.filter(Boolean).map(line => <AppText key={line} variant="caption" muted numberOfLines={2} dir={textDir}>{line}</AppText>)}
      {note && <AppText variant="caption" numberOfLines={2} dir={textDir} style={{ color: colors.accentText }}>{note}</AppText>}
      {extra}
    </View>
  </Pressable>;
}

export function RecipeGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 20 }}>{children}</View>;
}

/** Text tabs with a hot-pink dot on the selected one; scrolls sideways when the cuisines run long. */
export function RecipeTabs({ tabs, value, onChange, rtl }: { tabs: readonly { key: string; label: string }[]; value: string; onChange: (key: string) => void; rtl?: boolean }) {
  const { colors } = useRemyTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ marginHorizontal: -20, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={{ paddingHorizontal: 20, gap: 20 }}>
    {tabs.map(tab => { const selected = tab.key === value;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(tab.key)} hitSlop={6}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? colors.accent : 'transparent' }} />
        <AppText variant={selected ? 'label' : 'body'} style={{ color: selected ? colors.text : colors.textSecondary }}>{tab.label}</AppText>
      </Pressable>; })}
  </ScrollView>;
}

/** All, Quick, then the most common cuisines (at least `min` recipes each), most common first. */
export function recipeTabs(recipes: readonly { cuisineName?: string | null }[], copy: (en: string, ar: string) => string, max = 6, min = 5) {
  const counts = new Map<string, number>();
  for (const recipe of recipes) if (recipe.cuisineName) counts.set(recipe.cuisineName, (counts.get(recipe.cuisineName) ?? 0) + 1);
  const cuisines = [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, max).map(([name]) => ({ key: `cuisine:${name}`, label: name }));
  return [{ key: 'all', label: copy('All', 'الكل') }, { key: 'quick', label: copy('Quick', 'سريعة') }, ...cuisines];
}
export const recipeMinutes = (recipe: { prepTimeMin: number | null; cookTimeMin: number | null }) => recipe.prepTimeMin === null && recipe.cookTimeMin === null ? null : (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0);
export function filterRecipes<T extends { cuisineName?: string | null; prepTimeMin: number | null; cookTimeMin: number | null }>(recipes: readonly T[], tab: string): T[] {
  if (tab === 'quick') return recipes.filter(recipe => { const m = recipeMinutes(recipe); return m !== null && m <= 30; });
  if (tab.startsWith('cuisine:')) return recipes.filter(recipe => recipe.cuisineName === tab.slice(8));
  return [...recipes];
}
