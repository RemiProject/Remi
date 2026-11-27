import { Image } from 'expo-image';
import { useRemyTheme } from '@/theme/provider';

// White-on-transparent cuts of the Remi logo (assets/brand), tinted per theme.
const art = {
  logo: { source: require('../../assets/brand/logo.png'), ratio: 900 / 1062 },
  wordmark: { source: require('../../assets/brand/wordmark.png'), ratio: 690 / 238 },
  mascot: { source: require('../../assets/brand/mascot.png'), ratio: 600 / 585 },
} as const;

/** The mascot alone is decorative; the logo and wordmark read as "Remi". */
export function Brand({ kind, height, color }: { kind: keyof typeof art; height: number; color?: string }) {
  const { colors } = useRemyTheme();
  const named = kind !== 'mascot';
  return <Image source={art[kind].source} tintColor={color ?? colors.logo} contentFit="contain" accessible={named} accessibilityRole={named ? 'image' : undefined} accessibilityLabel={named ? 'Remi' : undefined}
    style={{ height, width: Math.round(height * art[kind].ratio) }} />;
}
