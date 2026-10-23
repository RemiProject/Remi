import { useState } from 'react';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { Icon } from './ui/icon';
import { useRemyTheme } from '@/theme/provider';

export function FoodImage({ uri, height = 150, label }: { uri?: string; height?: number; label: string }) {
  return <FoodImageContent key={uri ?? 'fallback'} uri={uri} height={height} label={label} />;
}
function FoodImageContent({ uri, height, label }: { uri?: string; height: number; label: string }) {
  const { colors } = useRemyTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <View accessibilityLabel={label} style={{ height, width: '100%', backgroundColor: colors.surfaceMuted, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
    <Icon name="recipe" size={36} color={colors.textSubtle} />
    {uri && !failed && <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk" transition={150}
      onError={() => setFailed(true)} onLoad={() => setLoaded(true)} accessibilityLabel={label}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: loaded ? 1 : 0 }} />}
  </View>;
}
