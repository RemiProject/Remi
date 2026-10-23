import { createContext, useContext, type PropsWithChildren } from 'react';
import { useFonts, type FontSource } from 'expo-font';
import { typography } from './tokens';

type BrandFont = 'Shrikhand' | 'Fredoka' | 'Nunito';
// Register approved local assets here with static require() calls, preserving licenses.
// Example after the actual file exists: Nunito: require('../../assets/fonts/Nunito-Regular.ttf').
// No brand font files are currently supplied. Never map a name to a missing/remote asset.
const bundledFonts: Partial<Record<BrandFont, FontSource>> = {};
const fallback = { brand: typography.family, heading: typography.family, body: typography.family };
const FontContext = createContext(fallback);

export function RemyFontProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts(bundledFonts);
  const family = (name: BrandFont) => loaded && !error && bundledFonts[name] ? name : typography.family;
  return (
    <FontContext.Provider value={{ brand: family('Shrikhand'), heading: family('Fredoka'), body: family('Nunito') }}>
      {children}
    </FontContext.Provider>
  );
}

export const useRemyFonts = () => useContext(FontContext);
