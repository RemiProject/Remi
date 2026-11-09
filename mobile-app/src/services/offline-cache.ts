import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The last data a screen loaded, kept on the phone per account so Remi still shows the kitchen, plans and lists
 * without a connection. Removed at sign-out. Writes are best effort: a full disk only costs the offline copy.
 */
const PREFIX = 'remi.offline.v1:';
export const offlineCache = {
  async read<T>(userId: string, key: string): Promise<T | null> {
    try { const raw = await AsyncStorage.getItem(`${PREFIX}${userId}:${key}`); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
  },
  write(userId: string, key: string, value: unknown) {
    void AsyncStorage.setItem(`${PREFIX}${userId}:${key}`, JSON.stringify(value)).catch(() => undefined);
  },
  async clear() {
    try { const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX)); if (keys.length) await AsyncStorage.multiRemove(keys); } catch { /* nothing cached */ }
  },
};
