export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/**
 * Access tokens remain short-lived signed JWTs and carry `sid` (session id).
 * Refresh tokens are opaque random values; only their sha256 is stored on Session.
 */
export interface TokenSignerPort {
  /** Sign a short-lived access JWT bound to this session. */
  issueAccess(userId: string, sessionId: string): Promise<{ accessToken: string; expiresInSeconds: number }>;

  /** Create a new opaque refresh token (raw) + its hash. Does not touch the DB. */
  createRefreshToken(): { raw: string; hash: string };

  /** Verify an access JWT and return subject + session id. */
  verifyAccess(token: string): Promise<{ userId: string; sessionId: string }>;
}
