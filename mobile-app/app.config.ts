import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * REMI_NO_SHARE_EXTENSION=1 builds without the iOS share extension. The extension needs the App Group
 * group.com.remi.cookbook.independent registered on the Apple team; until it is, phone builds use this switch and
 * recipes are saved by pasting a link instead. Run `npx expo prebuild --platform ios` again after changing it.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  if (!process.env.REMI_NO_SHARE_EXTENSION) return config as ExpoConfig;
  return {
    ...config,
    plugins: (config.plugins ?? []).map(plugin => Array.isArray(plugin) && plugin[0] === 'expo-sharing'
      ? ['expo-sharing', { ...plugin[1], ios: { ...plugin[1]?.ios, enabled: false } }]
      : plugin),
  } as ExpoConfig;
};
