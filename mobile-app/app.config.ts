import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist } from 'expo/config-plugins';

/**
 * Two switches for builds signed by a team that has not set up these capabilities yet (see docs/release.md):
 * - REMI_NO_SHARE_EXTENSION=1 builds without the iOS share extension, which needs the App Group
 *   group.com.remi.cookbook.independent registered on the Apple team. Recipes are then saved by pasting a link.
 * - REMI_NO_PUSH=1 builds without the Push Notifications entitlement. Reminders then stay inside the app.
 * - REMI_NO_WIDGETS=1 builds without the home screen widget, which also needs that App Group.
 * Run `npx expo prebuild --platform ios --clean` again after changing either.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const noShare = !!process.env.REMI_NO_SHARE_EXTENSION, noPush = !!process.env.REMI_NO_PUSH, noWidgets = !!process.env.REMI_NO_WIDGETS;
  const result = {
    ...config,
    plugins: (config.plugins ?? []).filter(plugin => !(noWidgets && Array.isArray(plugin) && plugin[0] === 'expo-widgets')).map(plugin => noShare && Array.isArray(plugin) && plugin[0] === 'expo-sharing'
      ? ['expo-sharing', { ...plugin[1], ios: { ...plugin[1]?.ios, enabled: false } }]
      : plugin),
  } as ExpoConfig;
  // Expo applies expo-notifications even when it is left out of the plugin list, so remove its entitlement instead.
  return noPush ? withEntitlementsPlist(result, mod => { delete mod.modResults['aps-environment']; return mod; }) : result;
};
