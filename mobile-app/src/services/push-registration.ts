import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getAuth } from './auth';

/** on: this device gets pushes. off: not allowed yet. blocked: refused in Settings. unavailable: no push in this build or platform. */
export type PushState = 'on' | 'off' | 'blocked' | 'unavailable';

const register = 'mutation RegisterDevice($platform: UserDevicePlatform!, $pushToken: String!, $appVersion: String) { registerDevice(platform: $platform, pushToken: $pushToken, appVersion: $appVersion) { id } }';

// Show reminders that arrive while Remi is open, as a banner.
if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Registers this device's push token with the account. Asks for permission only when `ask` is true (a tap, never on launch). */
export async function enablePush(ask: boolean): Promise<PushState> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return permission.canAskAgain ? 'off' : 'blocked';
    const { data } = await Notifications.getDevicePushTokenAsync();
    await getAuth().authenticatedGraphql(register, { platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', pushToken: String(data), appVersion: Constants.expoConfig?.version ?? null });
    return 'on';
  } catch {
    // A build without the push entitlement, or no network: reminders stay in the app.
    return 'unavailable';
  }
}
