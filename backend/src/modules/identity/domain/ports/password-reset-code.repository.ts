import type { Tx } from '@/platform/db/tx-context.js';

export interface PasswordResetCodeRecord {
  id: string;
  userId: string;
  /** Null for a link-only email: it counts toward the limits and is never verifiable. */
  codeHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  failedAttempts: number;
  usedAt: Date | null;
  invalidatedAt: Date | null;
}

export interface PasswordResetCodeRepository {
  /** Must precede every reset code read/write for this account in a transaction. */
  lockAccount(tx: Tx, userId: string): Promise<{ deletedAt: Date | null } | null>;
  /** Every reset email counts, with or without a code. */
  issuanceHistory(tx: Tx, userId: string, now: Date, windowMs: number): Promise<{ lastIssuedAt: Date | null; count: number }>;
  /** Sum of failed attempts on codes created after `since`. */
  failedAttemptsSince(tx: Tx, userId: string, since: Date): Promise<number>;
  /** The open, verifiable code (never a link-only row). */
  findOpen(tx: Tx, userId: string): Promise<PasswordResetCodeRecord | null>;
  findById(tx: Tx, id: string): Promise<PasswordResetCodeRecord | null>;
  recentCodes(tx: Tx, userId: string, since: Date): Promise<Array<{ id: string; codeHash: string }>>;
  /** Invalidates every open row of the account, link-only rows included. */
  invalidateOpen(tx: Tx, userId: string, now: Date): Promise<void>;
  insert(tx: Tx, row: PasswordResetCodeRecord): Promise<void>;
  recordFailure(tx: Tx, id: string, attempts: number, invalidatedAt: Date | null): Promise<void>;
  consume(tx: Tx, id: string, now: Date): Promise<void>;
}

export const PASSWORD_RESET_CODE_REPOSITORY = Symbol('PASSWORD_RESET_CODE_REPOSITORY');
