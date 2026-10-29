import { ShoppingProvider } from '@/providers/shopping-provider';
import { PlannerProvider } from '@/providers/planner-provider';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RemyThemeProvider, useRemyTheme } from '@/theme/provider';
import { RemyFontProvider } from '@/theme/fonts';
import { InventoryProvider } from '@/providers/inventory-provider';
import { LanguageProvider } from '@/providers/language-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { BackendKitchenProvider } from '@/providers/backend-kitchen-provider';

function Navigation() {
  const { colors, mode } = useRemyTheme();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border } }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="food-entry" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food/manual" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="food/edit/[id]" options={{ presentation: 'modal', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><RemyThemeProvider><RemyFontProvider><LanguageProvider><InventoryProvider><PlannerProvider><ShoppingProvider><AuthProvider><BackendKitchenProvider><Navigation /></BackendKitchenProvider></AuthProvider></ShoppingProvider></PlannerProvider></InventoryProvider></LanguageProvider></RemyFontProvider></RemyThemeProvider></SafeAreaProvider>;
}
