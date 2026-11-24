import type { Tx } from '@/platform/db/tx-context.js';

export interface EmailVerificationCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  failedAttempts: number;
  usedAt: Date | null;
  invalidatedAt: Date | null;
}

export interface EmailVerificationCodeRepository {
  /** Must precede every code read/write for this account, including future link-verification integration. */
  lockAccount(tx: Tx, userId: string): Promise<{ emailVerifiedAt: Date | null; deletedAt: Date | null } | null>;
  issuanceHistory(tx: Tx, userId: string, now: Date, windowMs: number): Promise<{ lastIssuedAt: Date | null; count: number }>;
  findOpen(tx: Tx, userId: string): Promise<EmailVerificationCodeRecord | null>;
  recentCodes(tx: Tx, userId: string, since: Date): Promise<Array<{ id: string; codeHash: string }>>;
  invalidateOpen(tx: Tx, userId: string, now: Date): Promise<void>;
  insert(tx: Tx, row: EmailVerificationCodeRecord): Promise<void>;
  recordFailure(tx: Tx, id: string, attempts: number, invalidatedAt: Date | null): Promise<void>;
  consume(tx: Tx, id: string, now: Date): Promise<void>;
}

export const EMAIL_VERIFICATION_CODE_REPOSITORY = Symbol('EMAIL_VERIFICATION_CODE_REPOSITORY');
