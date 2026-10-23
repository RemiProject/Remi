import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createBackendClient, resolveBackendUrl } from './backend-core';

export function getBackend() {
  const url = resolveBackendUrl({
    explicitUrl: process.env.EXPO_PUBLIC_API_URL,
    development: __DEV__,
    platform: Platform.OS,
    hostUri: Constants.expoConfig?.hostUri,
    webHostname: typeof window !== 'undefined' ? window.location?.hostname : undefined,
  });
  return { url, ...createBackendClient(url) };
}
