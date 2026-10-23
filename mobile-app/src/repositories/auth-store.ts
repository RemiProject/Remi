import type { createAuthService, CurrentUser, LoginInput } from '../services/auth-service';
import { authErrorKey, isSignedOutError } from '../services/auth-validation';

type Service = Pick<ReturnType<typeof createAuthService>, 'login' | 'me' | 'logout'>;
interface Snapshot { user: CurrentUser | null; busy: boolean; ready: boolean; error: string | null }
export class AuthStore {
  private snapshot: Snapshot = { user: null, busy: false, ready: false, error: null };
  private listeners = new Set<() => void>();
  constructor(private readonly service: () => Service) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initialSnapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach(listener => listener());
  }
  restore = async () => {
    if (this.snapshot.busy) return;
    this.publish({ busy: true, error: null });
    try { this.publish({ user: await this.service().me(), ready: true }); }
    catch (error) {
      if (isSignedOutError(error)) this.publish({ user: null, ready: true });
      else this.publish({ user: null, error: authErrorKey(error), ready: true });
    } finally { this.publish({ busy: false }); }
  };
  login = async (input: LoginInput): Promise<boolean> => {
    if (this.snapshot.busy) return false;
    this.publish({ busy: true, error: null });
    try {
      await this.service().login(input);
      this.publish({ user: await this.service().me(), ready: true });
      return true;
    } catch (error) {
      this.publish({ user: null, error: authErrorKey(error), ready: true });
      return false;
    } finally { this.publish({ busy: false }); }
  };
  logout = async () => {
    if (this.snapshot.busy) return;
    this.publish({ busy: true, error: null });
    try { await this.service().logout(); this.publish({ user: null, ready: true }); }
    catch { this.publish({ user: null, ready: true, error: 'logoutError' }); }
    finally { this.publish({ busy: false }); }
  };
}
const initialSnapshot: Snapshot = { user: null, busy: false, ready: false, error: null };
