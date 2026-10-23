import { Platform } from 'react-native';

export const palette = {
  'Remi Blue': '#293E7A', 'Deep Navy': '#16256B', Cream: '#F8F6E6',
  'Sky Blue': '#BCCBF0', Tomato: '#EF6A45', 'Butter Yellow': '#F5C75B',
} as const;

export const themes = {
  light: {
    background: palette.Cream, surface: '#FFFFFF', surfaceMuted: '#F0F1EC', surfaceElevated: '#FFFFFF',
    text: palette['Deep Navy'], textSecondary: '#526078', textSubtle: '#626D7B', border: '#DCE1E4', divider: '#E5E8E7',
    primary: palette['Remi Blue'], primaryPressed: palette['Deep Navy'], onPrimary: '#FFFFFF', primarySoft: '#EAF0FA',
    selectedSurface: '#EAF0FA', selectedText: palette['Deep Navy'], selectedBorder: palette['Remi Blue'],
    pressedSurface: '#E8ECEF', focusBorder: palette['Remi Blue'],
    inputSurface: '#FFFFFF', inputBorder: '#7C8996', placeholder: '#626D7B',
    disabledSurface: '#E4E7E7', disabledText: '#526078',
    navSurface: '#FFFFFF', navSelected: '#EAF0FA', modalSurface: '#FFFFFF', overlay: 'rgba(16, 24, 32, 0.45)',
    accent: palette.Tomato, hero: palette['Remi Blue'], onHero: palette.Cream, onHeroMuted: palette['Sky Blue'],
    warningSurface: '#FFF3D7', warningText: '#775413', successSurface: '#EAF2EC', successText: '#285C3B',
    errorSurface: '#FAEEEA', errorText: '#92351D', destructive: '#92351D', onDestructive: '#FFFFFF',
    unavailableSurface: '#F0F1EC', unavailableText: '#526078',
  },
  dark: {
    background: '#121820', surface: '#1C2530', surfaceMuted: '#202B37', surfaceElevated: '#293542',
    text: '#F2F3EC', textSecondary: '#B9C3CF', textSubtle: '#9EADBD', border: '#3B4755', divider: '#35414E',
    primary: palette['Sky Blue'], primaryPressed: '#A4B7DD', onPrimary: palette['Deep Navy'], primarySoft: '#293647',
    selectedSurface: '#293647', selectedText: '#F2F3EC', selectedBorder: palette['Sky Blue'],
    pressedSurface: '#334151', focusBorder: palette['Sky Blue'],
    inputSurface: '#18212C', inputBorder: '#64768B', placeholder: '#9EADBD',
    disabledSurface: '#2B3541', disabledText: '#A0AEBD',
    navSurface: '#1C2530', navSelected: '#293647', modalSurface: '#293542', overlay: 'rgba(0, 0, 0, 0.65)',
    accent: palette['Butter Yellow'], hero: '#293542', onHero: '#F2F3EC', onHeroMuted: '#B9C3CF',
    warningSurface: '#393223', warningText: '#E9C980', successSurface: '#24372E', successText: '#B7DFC2',
    errorSurface: '#3B2928', errorText: '#F3B6A6', destructive: '#F3B6A6', onDestructive: '#291E1A',
    unavailableSurface: '#202B37', unavailableText: '#B9C3CF',
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
export const radii = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
export const layout = { maxWidth: 720, minTouchTarget: 44 } as const;
