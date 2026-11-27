import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { DomainError } from '@/shared/domain-error.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { PASSWORD_RESET_CODE_REPOSITORY, type PasswordResetCodeRecord, type PasswordResetCodeRepository } from '@/modules/identity/domain/ports/password-reset-code.repository.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { deriveOneTimeCode, hashOneTimeCode, matchesOneTimeCode } from '@/modules/identity/domain/services/one-time-code.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { passwordResetCodePolicy as policy } from './password-reset-code.config.js';

export type ResetCodeIssueResult = { status: 'issued' | 'link-only'; challenge: PasswordResetCodeRecord }
  | { status: 'not-eligible' | 'cooldown' | 'daily-cap' };

/** A valid UUID that no account has: locking it does the same work as locking a real account, and finds nothing. */
const NO_ACCOUNT = '00000000-0000-0000-0000-000000000000';
const invalidCode = () => new DomainError('INVALID_PASSWORD_RESET_CODE', 'The reset code is invalid or expired.', 422);
const derive = (secret: Buffer, userId: string, id: string) => deriveOneTimeCode('password-reset', secret, userId, id);
const matches = (secret: Buffer, userId: string, id: string, code: string, hash: string) => matchesOneTimeCode('password-reset', secret, userId, id, code, hash);

/**
 * Reset codes share EMAIL_VERIFICATION_CODE_SECRET with verification codes; the HMAC purpose labels keep them apart.
 * Issuance and exchange take the account lock first. Email delivery never holds a database transaction.
 */
@Injectable()
export class PasswordResetCodeService {
  constructor(
    private readonly config: AppConfigService,
    private readonly transactions: TransactionRunner,
    private readonly tokens: OneTimeTokenService,
    @Inject(PASSWORD_RESET_CODE_REPOSITORY) private readonly repository: PasswordResetCodeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepository: TokenRepository,
  ) {}

  protected now(): Date { return new Date(); }
  protected newChallengeId(): string { return randomUUID(); }

  private get secret(): Buffer | null {
    const value = this.config.env.EMAIL_VERIFICATION_CODE_SECRET;
    return value ? Buffer.from(value, 'base64url') : null;
  }

  get isEnabled(): boolean { return this.secret !== null; }

  /** Failures counted from codes created up to one lifetime before the window, so the lock never ends early. */
  private async accountLocked(tx: Tx, userId: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - policy.dailyWindowMs - policy.lifetimeMs);
    return (await this.repository.failedAttemptsSince(tx, userId, since)) >= policy.accountFailureLimit;
  }

  issue(userId: string): Promise<ResetCodeIssueResult> {
    return this.transactions.run(tx => this.issueWithinTransaction(tx, userId), { userId });
  }

  /**
   * Records one reset email. The caller queues that email in this SAME transaction, and only for `issued` or `link-only`.
   * Without the secret the row has no code, but it still counts toward the shared cooldown and daily cap.
   */
  async issueWithinTransaction(tx: Tx, userId: string): Promise<ResetCodeIssueResult> {
    const account = await this.repository.lockAccount(tx, userId);
    if (!account || account.deletedAt) return { status: 'not-eligible' };
    const now = this.now(); // Sample after waiting for the lock, not before.
    const history = await this.repository.issuanceHistory(tx, userId, now, policy.dailyWindowMs);
    if (history.lastIssuedAt && now.getTime() - history.lastIssuedAt.getTime() < policy.cooldownMs) return { status: 'cooldown' };
    if (history.count >= policy.dailyCap) return { status: 'daily-cap' };
    const secret = this.secret;
    let id = this.newChallengeId();
    let codeHash: string | null = null;
    if (secret) {
      const recent = await this.repository.recentCodes(tx, userId, new Date(now.getTime() - policy.lifetimeMs));
      let code = derive(secret, userId, id);
      while (recent.some(row => matches(secret, userId, row.id, code, row.codeHash))) {
        id = this.newChallengeId();
        code = derive(secret, userId, id);
      }
      codeHash = hashOneTimeCode('password-reset', secret, userId, id, code);
    }
    // A new reset email replaces any open code.
    await this.repository.invalidateOpen(tx, userId, now);
    const challenge: PasswordResetCodeRecord = {
      id, userId, codeHash, createdAt: now, expiresAt: new Date(now.getTime() + policy.lifetimeMs),
      failedAttempts: 0, usedAt: null, invalidatedAt: null,
    };
    await this.repository.insert(tx, challenge);
    return { status: codeHash ? 'issued' : 'link-only', challenge };
  }

  /**
   * Exchanges a correct code for a single-use reset token, accepted by the existing resetPassword.
   * Every failure, including an unknown email, a locked account or a missing secret, is the same generic error.
   */
  async exchange(email: string, code: string): Promise<{ resetToken: string; expiresAt: Date }> {
    const secret = this.secret;
    const address = typeof email === 'string' ? normalizeEmail(email) : '';
    const wellFormed = typeof code === 'string' && /^[0-9]{6}$/.test(code) && address.length > 0 && address.length <= 254;
    const user = address.length > 0 && address.length <= 254 ? await this.users.findByEmail(this.transactions.db, address) : null;
    if (!secret || !user || !wellFormed) {
      // Comparable work for an unknown email, a malformed email or code, or a missing secret: a transaction with the
      // same row-lock query (matching no row) and an HMAC. A malformed code never counts as a wrong attempt.
      // Exact timing equality is not the aim; an obvious gap is.
      await this.transactions.run(tx => this.repository.lockAccount(tx, NO_ACCOUNT));
      matches(secret ?? Buffer.alloc(32), NO_ACCOUNT, '', typeof code === 'string' ? code : '', '0'.repeat(64));
      throw invalidCode();
    }
    const userId = user.id;
    const result = await this.transactions.run(async tx => {
      const account = await this.repository.lockAccount(tx, userId);
      if (!account || account.deletedAt) return null;
      const now = this.now();
      if (await this.accountLocked(tx, userId, now)) {
        matches(secret, userId, '', code, '0'.repeat(64));
        return null; // Refused without counting: the lock already applies.
      }
      const row = await this.repository.findOpen(tx, userId);
      if (!row?.codeHash || row.expiresAt <= now || row.failedAttempts >= policy.maxWrongAttempts) return null;
      if (!matches(secret, userId, row.id, code, row.codeHash)) {
        const attempts = row.failedAttempts + 1;
        await this.repository.recordFailure(tx, row.id, attempts, attempts === policy.maxWrongAttempts ? now : null);
        return null;
      }
      await this.repository.consume(tx, row.id, now);
      const issued = this.tokens.issue('PASSWORD_RESET', userId, now, policy.resetTokenLifetimeMs);
      await this.tokenRepository.insert(tx, issued.row);
      return { resetToken: issued.raw, expiresAt: issued.row.expiresAt };
    }, { userId });
    // Throw AFTER commit: failed attempt counters must survive the error response.
    if (!result) throw invalidCode();
    return result;
  }

  /** Re-check immediately before SMTP handoff. Undefined means the email goes out with the link only. */
  async codeForEmail(challengeId: string): Promise<string | undefined> {
    const secret = this.secret;
    if (!secret) return undefined;
    const db = this.transactions.db;
    const row = await this.repository.findById(db, challengeId);
    const now = this.now();
    if (!row?.codeHash || row.usedAt || row.invalidatedAt || row.expiresAt <= now || row.failedAttempts >= policy.maxWrongAttempts) return undefined;
    const account = await this.users.findById(db, row.userId);
    if (!account || await this.accountLocked(db, row.userId, now)) return undefined;
    const code = derive(secret, row.userId, row.id);
    // Secret rotation must not email a newly derived code which differs from the stored challenge.
    return matches(secret, row.userId, row.id, code, row.codeHash) ? code : undefined;
  }

  /** For a successful password reset: no reset code of this account works afterwards. */
  async invalidateAllWithinTransaction(tx: Tx, userId: string): Promise<void> {
    await this.repository.lockAccount(tx, userId);
    await this.repository.invalidateOpen(tx, userId, this.now());
  }
}
