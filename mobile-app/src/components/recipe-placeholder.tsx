import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useRemyTheme } from '@/theme/provider';

export function RecipePlaceholder({ label }: { label: string }) {
  const { colors } = useRemyTheme();
  return <View accessibilityRole="image" accessibilityLabel={label} style={{ height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}>
    <Icon name="recipe" size={40} color={colors.textSubtle} />
  </View>;
}
