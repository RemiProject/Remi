import * as SecureStore from 'expo-secure-store';
import type { AuthStorage } from './auth-service';

const key = 'remy.auth.session.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const authStorage: AuthStorage = {
  read: () => SecureStore.getItemAsync(key, options),
  write: (value) => SecureStore.setItemAsync(key, value, options),
  clear: () => SecureStore.deleteItemAsync(key, options),
};
