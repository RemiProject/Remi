/** Pages shared to Remi from another app's share sheet open the recipe import screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/import-recipe?shared=1';
  } catch { /* not a full URL: a normal in-app path */ }
  return path;
}
