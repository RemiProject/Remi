import { createContext, useContext, type PropsWithChildren } from 'react';
import { useFonts } from 'expo-font';
import { typography } from './tokens';
const fallback = { brand: typography.family, heading: typography.family, label: typography.family, body: typography.family, ready: false };
const FontContext = createContext(fallback);
// Static DM Sans cuts (from the bundled variable font) so weights render the same on iOS, Android and web.
export function RemyFontProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts({
    RemiDisplay: require('../../assets/fonts/DMSans-Display.ttf'),
    RemiHeading: require('../../assets/fonts/DMSans-Heading.ttf'),
    RemiLabel: require('../../assets/fonts/DMSans-SemiBold.ttf'),
    CookbookSans: require('../../assets/fonts/DMSans.ttf'),
  });
  return <FontContext.Provider value={loaded ? { brand: 'RemiDisplay', heading: 'RemiHeading', label: 'RemiLabel', body: 'CookbookSans', ready: true } : { ...fallback, ready: !!error }}>{children}</FontContext.Provider>;
}
export const useRemyFonts = () => useContext(FontContext);
