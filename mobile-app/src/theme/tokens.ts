import { Platform } from 'react-native';

export const palette = {
  'Remi Blue': '#B92318', 'Deep Navy': '#752116', Cream: '#FFF7E8',
  'Sky Blue': '#F7CA51', Tomato: '#C22C1C', 'Butter Yellow': '#F7CA51',
} as const;

export const themes = {
  light: {
    background: palette.Cream, surface: '#FFFCF4', surfaceMuted: '#F7E7BF', surfaceElevated: '#FFFCF4',
    text: '#271B15', textSecondary: '#655549', textSubtle: '#756451', border: '#D8C7AA', divider: '#E7D8C0',
    primary: palette['Remi Blue'], primaryPressed: palette['Deep Navy'], onPrimary: '#FFFCF4', primarySoft: '#F7CA51',
    selectedSurface: '#F7CA51', selectedText: palette['Deep Navy'], selectedBorder: palette['Remi Blue'],
    pressedSurface: '#EAD7B2', focusBorder: palette['Remi Blue'],
    inputSurface: '#FFFCF4', inputBorder: '#A98D6C', placeholder: '#756451',
    disabledSurface: '#E5D9C6', disabledText: '#655549',
    navSurface: '#FFFCF4', navSelected: '#F7CA51', modalSurface: '#FFFCF4', overlay: 'rgba(16, 24, 32, 0.45)',
    accent: palette.Tomato, hero: palette['Remi Blue'], onHero: palette.Cream, onHeroMuted: palette['Sky Blue'],
    warningSurface: '#FFF3D7', warningText: '#775413', successSurface: '#E6ECD9', successText: '#35532B',
    errorSurface: '#FAEEEA', errorText: '#92351D', destructive: '#92351D', onDestructive: '#FFFCF4',
    unavailableSurface: '#F7E7BF', unavailableText: '#655549',
  },
  dark: {
    background: '#211B17', surface: '#2D241E', surfaceMuted: '#382D24', surfaceElevated: '#423329',
    text: '#FFF3DC', textSecondary: '#D6C6AD', textSubtle: '#BCA88C', border: '#5A4838', divider: '#4A3A2D',
    primary: palette['Sky Blue'], primaryPressed: '#E6B547', onPrimary: '#271B15', primarySoft: '#4A3825',
    selectedSurface: '#4A3825', selectedText: '#FFF3DC', selectedBorder: palette['Sky Blue'],
    pressedSurface: '#56412D', focusBorder: palette['Sky Blue'],
    inputSurface: '#2D241E', inputBorder: '#A08B70', placeholder: '#BCA88C',
    disabledSurface: '#413529', disabledText: '#C6B395',
    navSurface: '#2D241E', navSelected: '#4A3825', modalSurface: '#423329', overlay: 'rgba(0, 0, 0, 0.65)',
    accent: palette['Butter Yellow'], hero: '#423329', onHero: '#FFF3DC', onHeroMuted: '#D6C6AD',
    warningSurface: '#393223', warningText: '#E9C980', successSurface: '#24372E', successText: '#B7DFC2',
    errorSurface: '#3B2928', errorText: '#F3B6A6', destructive: '#F3B6A6', onDestructive: '#291E1A',
    unavailableSurface: '#382D24', unavailableText: '#D6C6AD',
  },
} as const;

// Actual brand fonts are still missing. Keep native fallbacks until licensed local assets exist.
export const typography = {
  family: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  brand: { fontSize: 28, fontWeight: '800' as const },
  heading: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 12, fontWeight: '600' as const },
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 12, lg: 18, pill: 999 } as const;
export const layout = { maxWidth: 720, minTouchTarget: 44 } as const;
