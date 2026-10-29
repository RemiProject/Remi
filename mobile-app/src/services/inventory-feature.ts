export function isBackendInventoryEnabled(): boolean {
  // Static property access is required for Expo's public env substitution.
  return process.env.EXPO_PUBLIC_BACKEND_INVENTORY === 'true';
}
