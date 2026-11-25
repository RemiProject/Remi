import type { createAuthService, CurrentUser, LoginInput } from '../services/auth-service';
import { authErrorKey, isEmailNotVerifiedError, isSignedOutError } from '../services/auth-validation';

type Service = Pick<ReturnType<typeof createAuthService>, 'login' | 'me' | 'logout' | 'deleteAccount'>;
interface Snapshot { user: CurrentUser | null; busy: boolean; ready: boolean; error: string | null }
/** `error` is the message key also published in the snapshot. `busy` means another session call was running, so nothing was sent. */
export type LoginResult = { ok: true } | { ok: false; reason: 'busy' } | { ok: false; reason: 'emailNotVerified' | 'failed'; error: string };
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
  login = async (input: LoginInput): Promise<boolean> => (await this.loginWithResult(input)).ok;
  /** The same sign-in as `login`, but says why it failed so a screen can continue to email verification. */
  loginWithResult = async (input: LoginInput): Promise<LoginResult> => {
    if (this.snapshot.busy) return { ok: false, reason: 'busy' };
    this.publish({ busy: true, error: null });
    try {
      await this.service().login(input);
      this.publish({ user: await this.service().me(), ready: true });
      return { ok: true };
    } catch (error) {
      const key = authErrorKey(error);
      this.publish({ user: null, error: key, ready: true });
      return { ok: false, reason: isEmailNotVerifiedError(error) ? 'emailNotVerified' : 'failed', error: key };
    } finally { this.publish({ busy: false }); }
  };
  logout = async () => {
    if (this.snapshot.busy) return;
    this.publish({ busy: true, error: null });
    try { await this.service().logout(); this.publish({ user: null, ready: true }); }
    catch { this.publish({ user: null, ready: true, error: 'logoutError' }); }
    finally { this.publish({ busy: false }); }
  };
  /** Resolves to null when the account is gone, otherwise to the message key for what went wrong (the person stays signed in). */
  deleteAccount = async (password: string): Promise<string | null> => {
    if (this.snapshot.busy) return 'wait';
    this.publish({ busy: true, error: null });
    try { await this.service().deleteAccount(password); this.publish({ user: null, ready: true }); return null; }
    catch (error) { return authErrorKey(error); }
    finally { this.publish({ busy: false }); }
  };
}
const initialSnapshot: Snapshot = { user: null, busy: false, ready: false, error: null };
