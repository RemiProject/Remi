import { getBackend } from './backend';
import { createAuthService } from './auth-service';
import { authStorage } from './auth-storage';

let service: ReturnType<typeof createAuthService> | undefined;
// Lazy initialization: importing the service does not read storage or contact the API.
// Reload the app after changing the backend URL.
export function getAuth() {
  if (!service) {
    const backend = getBackend();
    service = createAuthService(backend, authStorage, backend.url);
  }
  return service;
}
