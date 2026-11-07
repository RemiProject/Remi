import { createContext, useContext, type PropsWithChildren } from 'react';
import { useFonts } from 'expo-font';
import { typography } from './tokens';
const fallback = { brand: typography.family, heading: typography.family, body: typography.family };
const FontContext = createContext(fallback);
export function RemyFontProvider({ children }: PropsWithChildren) {
  const [loaded] = useFonts({
    CookbookSerif: require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
    CookbookSans: require('../../assets/fonts/DMSans.ttf'),
  });
  return <FontContext.Provider value={loaded ? { brand: 'CookbookSerif', heading: 'CookbookSerif', body: 'CookbookSans' } : fallback}>{children}</FontContext.Provider>;
}
export const useRemyFonts = () => useContext(FontContext);
