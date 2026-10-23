import type { AuthStorage } from './auth-service';

// No secure browser equivalent of SecureStore. Never persist bearer tokens in
// localStorage, sessionStorage, AsyncStorage, or cookies accessible to JavaScript.
let value: string | null = null;
export const authStorage: AuthStorage = {
  read: async () => value,
  write: async (next) => { value = next; },
  clear: async () => { value = null; },
};
