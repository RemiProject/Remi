import { BackendError, type createBackendClient } from './backend-core';

export type LoginInput = { password: string } & ({ identifier: string; email?: never } | { email: string; identifier?: never });
export interface RegisterInput {
  email: string; password: string; name: string; username: string; phoneNumber: string;
  countryCode?: string; localeCode?: string; timezone?: string; languageCode?: 'ar' | 'en';
}
export interface RegistrationReferences {
  countries: { code: string; name: string }[];
  locales: { code: string; name: string; languageCode: string }[];
}
export interface AuthTokens { accessToken: string; refreshToken: string; expiresInSeconds: number }
export interface CurrentUser {
  id: string; email: string; name: string; timezone: string; languageCode: string; emailVerifiedAt: string | null;
}
interface Session { accessToken: string; refreshToken: string; expiresAt: number }
export interface AuthStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
type Client = Pick<ReturnType<typeof createBackendClient>, 'graphql'> & { live?: () => Promise<void> };

// Match identity.inputs.ts, identity.types.ts, and AuthResolver in the backend.
export const authOperations = {
  register: 'mutation Register($input: RegisterInput!) { register(input: $input) { userId } }',
  references: 'query RegistrationReferences { countries { code name } locales { code name languageCode } }',
  requestReset: 'mutation RequestPasswordReset($input: RequestPasswordResetInput!) { requestPasswordReset(input: $input) }',
  reset: 'mutation ResetPassword($input: ResetPasswordInput!) { resetPassword(input: $input) }',
  login: 'mutation Login($input: LoginInput!) { login(input: $input) { accessToken refreshToken expiresInSeconds } }',
  me: 'query Me { me { id email name timezone languageCode emailVerifiedAt } }',
  refresh: 'mutation RefreshAccessToken($input: RefreshAccessTokenInput!) { refreshAccessToken(input: $input) { accessToken refreshToken expiresInSeconds } }',
  logout: 'mutation Logout($input: LogoutInput!) { logout(input: $input) }',
  deleteAccount: 'mutation DeleteAccount($input: DeleteAccountInput!) { deleteAccount(input: $input) }',
} as const;

export class AuthError extends Error {
  constructor(readonly code: 'NO_SESSION' | 'STORAGE' | 'INVALID_RESPONSE', message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Session;
  return typeof s.accessToken === 'string' && !!s.accessToken && typeof s.refreshToken === 'string' && !!s.refreshToken
    && typeof s.expiresAt === 'number' && Number.isFinite(s.expiresAt) && s.expiresAt > 0;
}
function unauthenticated(error: unknown) {
  return error instanceof BackendError && (error.status === 401 || error.codes.includes('UNAUTHENTICATED'));
}

/** One instance per backend. All session operations serialize, including disk writes.
 * Authenticated GraphQL calls run concurrently; only session transitions serialize.
 * Never auto-retry refresh: its single-use token may have been consumed before a timeout.
 */
export function createAuthService(client: Client, storage: AuthStorage, backendUrl: string, now = Date.now) {
  let session: Session | null = null;
  // The last account details the server confirmed, kept with the session so Remi opens signed in without a connection.
  let cachedUser: CurrentUser | null = null;
  let loaded = false;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingRefresh: Promise<void> | undefined;
  // Changes at account/session boundaries, but not during token rotation.
  let identityRevision = 0;
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }
  async function clear({ rotation = false }: { rotation?: boolean } = {}) {
    if (!rotation) { identityRevision++; cachedUser = null; }
    session = null;
    loaded = true;
    try { await storage.clear(); }
    catch { throw new AuthError('STORAGE', 'Could not clear secure session storage.'); }
  }
  async function load() {
    if (loaded) return;
    let raw: string | null;
    try { raw = await storage.read(); }
    catch { throw new AuthError('STORAGE', 'Could not read secure session storage.'); }
    if (raw !== null) {
      let record;
      try { record = JSON.parse(raw); } catch { /* invalid record is removed below */ }
      if (record?.version === 1 && record.backendUrl === backendUrl && isSession(record.session)) {
        identityRevision++;
        session = record.session;
        cachedUser = record.user && typeof record.user.id === 'string' ? record.user : null;
      }
      else await clear();
    }
    loaded = true;
  }
  function requireSession() {
    if (!session) throw new AuthError('NO_SESSION', 'Sign in is required.');
    return session;
  }
  async function save(tokens: AuthTokens, requestedAt: number, { rotation = false }: { rotation?: boolean } = {}) {
    if (!tokens || typeof tokens.accessToken !== 'string' || !tokens.accessToken
      || typeof tokens.refreshToken !== 'string' || !tokens.refreshToken
      || !Number.isFinite(tokens.expiresInSeconds) || tokens.expiresInSeconds <= 0) {
      await clear();
      throw new AuthError('INVALID_RESPONSE', 'Invalid authentication response.');
    }
    // Request start is conservative: network time does not extend server token lifetime.
    const next = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
      expiresAt: requestedAt + tokens.expiresInSeconds * 1000 };
    try { await storage.write(JSON.stringify({ version: 1, backendUrl, session: next, user: cachedUser })); }
    catch {
      await clear();
      throw new AuthError('STORAGE', 'Could not save secure session storage.');
    }
    if (!rotation) identityRevision++;
    session = next;
    loaded = true;
  }
  async function rotate() {
    const previous = requireSession();
    // The refresh token is single-use and is dropped before the request. Offline, keep it: nothing has been sent yet.
    if (client.live) await client.live();
    const previousRevision = identityRevision;
    // Remove the single-use token before dispatch, including from disk. A crash or
    // ambiguous network failure must never restore/reuse an already rotated token.
    try {
      await clear({ rotation: true });
      const requestedAt = now();
      const result = await client.graphql<{ refreshAccessToken: AuthTokens }>(authOperations.refresh,
        { input: { refreshToken: previous.refreshToken } });
      await save(result.refreshAccessToken, requestedAt, { rotation: true });
    } catch (error) {
      // Rotation's temporary clear preserves identity only if replacement succeeds.
      // Invalid tokens/save failures may already have incremented through clear().
      if (identityRevision === previousRevision) identityRevision++;
      throw error;
    }
  }
  async function validSession(refresh = rotate) {
    await load();
    if (requireSession().expiresAt <= now() + 30000) await refresh();
    return requireSession();
  }
  function signedOut() {
    return new AuthError('NO_SESSION', 'Your session has expired. Please sign in again.');
  }
  async function refreshForRequest() {
    try { await rotate(); }
    catch (error) {
      if (session) throw error; // unreachable before anything was sent: still signed in, just offline
      throw signedOut(); // rotate already discarded the single-use refresh token.
    }
  }
  async function authenticatedGraphql<T>(query: string, variables: Record<string, unknown> = {}, householdId?: string): Promise<T> {
    const initial = await serial(async () => {
      await load();
      const previous = requireSession();
      const current = await validSession(refreshForRequest);
      return { current, refreshed: current !== previous, revision: identityRevision };
    });
    const send = async (current: Session): Promise<T> => {
      const data = await client.graphql<T>(query, variables, {
        accessToken: current.accessToken, ...(householdId ? { householdId } : {}),
      });
      return serial(async () => {
        if (initial.revision !== identityRevision || !session) throw signedOut();
        return data;
      });
    };
    try { return await send(initial.current); }
    catch (error) {
      if (!unauthenticated(error)) throw error;
    }
    const retrySession = await serial(async () => {
      if (initial.revision !== identityRevision) throw signedOut();
      const current = requireSession();
      // Another request (or explicit refresh) already rotated this rejected token.
      // This also handles late 401 responses arriving after that refresh finished.
      if (current !== initial.current) return current;
      if (initial.refreshed) {
        await clear();
        throw signedOut();
      }
      await refreshForRequest();
      return requireSession();
    });
    try { return await send(retrySession); }
    catch (error) {
      if (!unauthenticated(error)) throw error;
      await serial(async () => {
        if (initial.revision === identityRevision && session === retrySession) await clear();
      });
      throw signedOut();
    }
  }
  return {
    authenticatedGraphql,
    getIdentityRevision: () => identityRevision,
    async getIdentityContext() {
      await serial(load);
      const revision = identityRevision;
      const { me } = await authenticatedGraphql<{ me: CurrentUser }>(authOperations.me);
      if (revision !== identityRevision) throw signedOut();
      if (typeof me?.id !== 'string' || !me.id) throw new AuthError('INVALID_RESPONSE', 'Missing signed-in user identity.');
      return { backendUrl, userId: me.id, revision };
    },
    async requestPasswordReset(email: string): Promise<void> {
      await client.graphql(authOperations.requestReset, { input: { email } });
    },
    resetPassword(token: string, newPassword: string): Promise<void> {
      return serial(async () => {
        await client.graphql(authOperations.reset, { input: { token, newPassword } });
        // Backend password reset revokes all sessions, including this device.
        await clear();
      });
    },
    async register(input: RegisterInput): Promise<{ userId: string }> {
      // Registration deliberately does not create or replace an authenticated session.
      return (await client.graphql<{ register: { userId: string } }>(authOperations.register, { input })).register;
    },
    registrationReferences(): Promise<RegistrationReferences> {
      return client.graphql<RegistrationReferences>(authOperations.references);
    },
    login(input: LoginInput): Promise<void> {
      return serial(async () => {
        const requestedAt = now();
        const result = await client.graphql<{ login: AuthTokens }>(authOperations.login,
          { input: { ...(input.identifier !== undefined ? { identifier: input.identifier } : { email: input.email }), password: input.password } });
        await save(result.login, requestedAt);
      });
    },
    me(): Promise<CurrentUser> {
      return serial(async () => {
        const remember = async (user: CurrentUser) => {
          cachedUser = user;
          const current = session;
          if (current) { try { await storage.write(JSON.stringify({ version: 1, backendUrl, session: current, user })); } catch { /* the session itself is already saved */ } }
          return user;
        };
        // Unreachable server (no HTTP status or a 5xx): open with the account the server last confirmed.
        const offline = (error: unknown) => error instanceof BackendError && !error.codes.length && (error.status === undefined || error.status >= 500);
        let current: Session;
        try { current = await validSession(); }
        catch (error) { if (offline(error) && cachedUser && session) return cachedUser; throw error; }
        try {
          return await remember((await client.graphql<{ me: CurrentUser }>(authOperations.me, {}, current)).me);
        } catch (error) {
          if (offline(error) && cachedUser) return cachedUser;
          if (!unauthenticated(error)) throw error;
          await rotate();
          try {
            return await remember((await client.graphql<{ me: CurrentUser }>(authOperations.me, {}, requireSession())).me);
          } catch (retryError) {
            if (unauthenticated(retryError)) await clear();
            throw retryError;
          }
        }
      });
    },
    refreshAccessToken(): Promise<void> {
      if (!pendingRefresh) {
        pendingRefresh = serial(async () => { await load(); await rotate(); })
          .finally(() => { pendingRefresh = undefined; });
      }
      return pendingRefresh;
    },
    logout(): Promise<void> {
      return serial(async () => {
        try {
          await load();
          if (!session) return;
          // Logout is guarded by a valid access token in the backend.
          const current = await validSession();
          await clear();
          const result = await client.graphql<{ logout: boolean }>(authOperations.logout,
            { input: { refreshToken: current.refreshToken } }, current);
          if (result.logout !== true) throw new AuthError('INVALID_RESPONSE', 'Logout was not confirmed by the server.');
        } finally {
          // Local sign-out happens even when server revocation fails; failure is reported.
          await clear();
        }
      });
    },
    deleteAccount(password: string): Promise<void> {
      return serial(async () => {
        const result = await client.graphql<{ deleteAccount: boolean }>(authOperations.deleteAccount, { input: { password } }, await validSession());
        if (result.deleteAccount !== true) throw new AuthError('INVALID_RESPONSE', 'Deletion was not confirmed by the server.');
        // The server has revoked every session; only the local copy is left.
        await clear();
      });
    },
  };
}
