import { Platform } from 'react-native';

// Version 3 palette (user-pinned): lemon is the base, cobalt the action, hot pink the pop.
export const palette = {
  'Lemon Yellow': '#F8E45C', 'Cobalt Blue': '#1734BE', 'Hot Pink': '#ED2B8C',
  Ink: '#0E1440', Paper: '#FFFDF4', Night: '#0B1030',
} as const;

// Contrast (WCAG): ink on paper 17.3, cobalt on white 9.3, cobalt on lemon 7.2, ink on lemon 13.6,
// secondary #4B5070 on paper 7.7, subtle #5E6383 on white 5.9, pink text #C2146C on paper 5.7.
// Dark: text on night 17.0, lemon on night 14.4, pink #FF6FB5 on night 7.2, white on cobalt hero 9.3.
export const themes = {
  light: {
    background: palette.Paper, surface: '#FFFFFF', surfaceMuted: '#FCF4C4', surfaceElevated: '#FFFFFF',
    text: palette.Ink, textSecondary: '#4B5070', textSubtle: '#5E6383', border: '#DCDDEA', divider: '#ECECF4',
    primary: palette['Cobalt Blue'], primaryPressed: '#10268F', onPrimary: '#FFFFFF', primarySoft: '#E4E8FB',
    selectedSurface: palette['Lemon Yellow'], selectedText: palette.Ink, selectedBorder: palette['Lemon Yellow'],
    pressedSurface: '#F1F2FA', focusBorder: palette['Cobalt Blue'],
    inputSurface: '#FFFFFF', inputBorder: '#8E92B0', placeholder: '#5E6383',
    disabledSurface: '#ECECF4', disabledText: '#5E6383',
    navSurface: palette.Paper, navSelected: palette['Lemon Yellow'], modalSurface: '#FFFFFF', overlay: 'rgba(14, 20, 64, 0.45)',
    accent: palette['Hot Pink'], accentText: '#C2146C', onAccent: '#FFFFFF', accentSoft: '#FDE7F1',
    logo: palette['Cobalt Blue'], hero: palette['Lemon Yellow'], onHero: palette.Ink, onHeroMuted: '#3D3A12', shadow: 'rgba(14, 20, 64, 0.10)',
    warningSurface: '#FFF6CC', warningText: '#6B5300', successSurface: '#E3F4EA', successText: '#1F5A3A',
    errorSurface: '#FDE7F1', errorText: '#A10F58', destructive: '#B3125F', onDestructive: '#FFFFFF',
    unavailableSurface: '#ECECF4', unavailableText: '#4B5070',
    // Nutrition's daily rings sit on the hero surface (lemon here), so each ring colour is chosen against it.
    ringFuel: palette['Hot Pink'], ringProtein: palette['Cobalt Blue'], ringFibre: palette.Ink,
    // Macros keep the recipe page's mapping everywhere: cobalt protein, pink carbs, lemon fat.
    macroProtein: palette['Cobalt Blue'], macroCarbs: palette['Hot Pink'], macroFat: palette['Lemon Yellow'],
  },
  dark: {
    background: palette.Night, surface: '#151B45', surfaceMuted: '#1E2658', surfaceElevated: '#232C63',
    text: '#F3F4FF', textSecondary: '#B4B9DD', textSubtle: '#9DA3CF', border: '#2E3770', divider: '#232B5E',
    primary: palette['Lemon Yellow'], primaryPressed: '#E5CF3C', onPrimary: palette.Night, primarySoft: '#2B3470',
    selectedSurface: palette['Lemon Yellow'], selectedText: palette.Night, selectedBorder: palette['Lemon Yellow'],
    pressedSurface: '#232C63', focusBorder: palette['Lemon Yellow'],
    inputSurface: '#151B45', inputBorder: '#6E76AE', placeholder: '#9DA3CF',
    disabledSurface: '#1E2658', disabledText: '#9DA3CF',
    navSurface: palette.Night, navSelected: '#2B3470', modalSurface: '#232C63', overlay: 'rgba(0, 0, 0, 0.65)',
    accent: '#FF6FB5', accentText: '#FF9CCB', onAccent: palette.Night, accentSoft: '#3D1230',
    logo: '#FFFFFF', hero: palette['Cobalt Blue'], onHero: '#FFFFFF', onHeroMuted: '#DCE2FF', shadow: 'rgba(0, 0, 0, 0.35)',
    warningSurface: '#3A3415', warningText: palette['Lemon Yellow'], successSurface: '#12352A', successText: '#9BE3BD',
    errorSurface: '#3D1230', errorText: '#FF9CCB', destructive: '#FF9CCB', onDestructive: palette.Night,
    unavailableSurface: '#1E2658', unavailableText: '#B4B9DD',
    // On the cobalt hero: pink, lemon and white, the dark theme's own swap.
    ringFuel: '#FF6FB5', ringProtein: palette['Lemon Yellow'], ringFibre: '#FFFFFF',
    macroProtein: palette['Lemon Yellow'], macroCarbs: '#FF6FB5', macroFat: palette['Cobalt Blue'],
  },
} as const;

export const typography = {
  family: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  brand: { fontSize: 28, fontWeight: '800' as const },
  heading: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 12, fontWeight: '600' as const },
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const layout = { maxWidth: 720, minTouchTarget: 44 } as const;
