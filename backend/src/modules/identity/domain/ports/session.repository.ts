import type { Tx } from '@/platform/db/tx-context.js';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface NewSession {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
}

/** Row locked with FOR UPDATE during refresh rotation. */
export interface SessionRow {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface SessionRepository {
  insert(tx: Tx, session: NewSession): Promise<void>;

  /** Lock the row that matches the hash (active or not). Caller decides validity. */
  findByRefreshHashForUpdate(tx: Tx, refreshTokenHash: string): Promise<SessionRow | null>;

  /** Mark current session rotated and insert the successor in the same TX. */
  rotate(tx: Tx, args: {
    currentId: string;
    next: NewSession;
  }): Promise<void>;

  /** Revoke every session in the family (reuse detection). */
  revokeFamily(tx: Tx, familyId: string): Promise<void>;

  /** Revoke a single session by id belonging to the user (logout this device). */
  revokeById(tx: Tx, userId: string, sessionId: string): Promise<boolean>;

  /** Revoke every active session for the user (logout all devices). */
  revokeAllForUser(tx: Tx, userId: string): Promise<number>;

  touchLastUsed(tx: Tx, id: string): Promise<void>;

  /**
   * True if the session belongs to the user, is not revoked, and not past expiresAt.
   * Used by GqlAuthGuard so logout invalidates access JWTs immediately.
   */
  isActive(db: Tx, sessionId: string, userId: string): Promise<boolean>;
}
