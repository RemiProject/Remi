import { Image } from 'expo-image';
import { recipeImage } from '@/components/recipe-card';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';

export function RecipePlaceholder({ label, name, id }: { label: string; name?: string; id?: string }) {
  const { colors } = useRemyTheme();
  const photo = name ? recipeImage(name, id) : undefined;
  if (photo) return <Image source={photo} accessibilityLabel={name} contentFit="cover" style={{ height: 180, width: '100%' }} />;
  return <View accessibilityRole="image" accessibilityLabel={label} style={{ height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
    <Icon name="recipe" size={40} color={colors.textSubtle} />
  </View>;
}
