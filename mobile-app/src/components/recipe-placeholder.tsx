import { Image } from 'expo-image';
import { getCookbookContent } from '@/data/cookbook-content';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';

export function RecipePlaceholder({ label, name, id }: { label: string; name?: string; id?: string }) {
  const { colors } = useRemyTheme();
  const content = name ? getCookbookContent(name, id) : undefined;
  if (content) return <Image source={content.image} accessibilityLabel={name} contentFit="cover" style={{ height: 180, width: '100%' }} />;
  return <View accessibilityRole="image" accessibilityLabel={label} style={{ height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
    <Icon name="recipe" size={40} color={colors.textSubtle} />
  </View>;
}
