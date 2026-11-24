import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { DomainError } from '@/shared/domain-error.js';
import { EMAIL_VERIFICATION_CODE_REPOSITORY, type EmailVerificationCodeRecord, type EmailVerificationCodeRepository } from '@/modules/identity/domain/ports/email-verification-code.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { deriveEmailVerificationCode, hashEmailVerificationCode, matchesEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { emailVerificationCodePolicy as policy } from './email-verification-code.config.js';

export type CodeIssueResult = { status: 'issued'; challenge: EmailVerificationCodeRecord }
  | { status: 'disabled' | 'not-eligible' | 'cooldown' | 'daily-cap' };

const invalidCode = () => new DomainError('INVALID_EMAIL_VERIFICATION_CODE', 'The verification code is invalid or expired.', 422);

/** Issuance and verification share an account lock; email delivery never holds a database transaction. */
@Injectable()
export class EmailVerificationCodeService {
  constructor(
    private readonly config: AppConfigService,
    private readonly transactions: TransactionRunner,
    @Inject(EMAIL_VERIFICATION_CODE_REPOSITORY) private readonly repository: EmailVerificationCodeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  protected now(): Date { return new Date(); }
  protected newChallengeId(): string { return randomUUID(); }

  private get secret(): Buffer | null {
    const value = this.config.env.EMAIL_VERIFICATION_CODE_SECRET;
    return value ? Buffer.from(value, 'base64url') : null;
  }

  requireEnabled(): void {
    if (!this.secret) throw invalidCode();
  }

  async invalidateWithinTransaction(tx: Tx, userId: string): Promise<void> {
    await this.repository.lockAccount(tx, userId);
    await this.repository.invalidateOpen(tx, userId, this.now());
  }

  /** Re-check immediately before SMTP handoff. Never send an obsolete code from a durable payload. */
  async codeForEmail(challengeId: string): Promise<string | undefined> {
    const secret = this.secret;
    if (!secret) return undefined;
    const row = await this.repository.findById(this.transactions.db, challengeId);
    if (!row || row.usedAt || row.invalidatedAt || row.expiresAt <= this.now() || row.failedAttempts >= policy.maxWrongAttempts) return undefined;
    const account = await this.users.findById(this.transactions.db, row.userId);
    if (!account || account.emailVerifiedAt) return undefined;
    const code = deriveEmailVerificationCode(secret, row.userId, row.id);
    // Secret rotation must not email a newly derived code which differs from the stored challenge.
    return matchesEmailVerificationCode(secret, row.userId, row.id, code, row.codeHash) ? code : undefined;
  }

  issue(userId: string): Promise<CodeIssueResult> {
    if (!this.secret) return Promise.resolve({ status: 'disabled' });
    return this.transactions.run(tx => this.issueWithinTransaction(tx, userId));
  }

  /** Future registration/resend must queue their email in this SAME transaction, only for status=issued. */
  async issueWithinTransaction(tx: Tx, userId: string): Promise<CodeIssueResult> {
    const secret = this.secret;
    if (!secret) return { status: 'disabled' };
    const account = await this.repository.lockAccount(tx, userId);
    if (!account || account.deletedAt || account.emailVerifiedAt) return { status: 'not-eligible' };
    const now = this.now(); // Sample after waiting for the lock, not before.
    const history = await this.repository.issuanceHistory(tx, userId, now, policy.dailyWindowMs);
    if (history.lastIssuedAt && now.getTime() - history.lastIssuedAt.getTime() < policy.cooldownMs) return { status: 'cooldown' };
    if (history.count >= policy.dailyCap) return { status: 'daily-cap' };
    const recent = await this.repository.recentCodes(tx, userId, new Date(now.getTime() - policy.lifetimeMs));
    let id: string;
    let code: string;
    do {
      id = this.newChallengeId();
      code = deriveEmailVerificationCode(secret, userId, id);
    } while (recent.some(row => matchesEmailVerificationCode(secret, userId, row.id, code, row.codeHash)));
    await this.repository.invalidateOpen(tx, userId, now);
    const challenge: EmailVerificationCodeRecord = {
      id, userId, codeHash: hashEmailVerificationCode(secret, userId, id, code),
      createdAt: now, expiresAt: new Date(now.getTime() + policy.lifetimeMs), failedAttempts: 0, usedAt: null, invalidatedAt: null,
    };
    await this.repository.insert(tx, challenge);
    return { status: 'issued', challenge };
  }

  async verify(userId: string | null, code: string): Promise<true> {
    const secret = this.secret;
    if (!secret) throw invalidCode();
    if (!userId) {
      matchesEmailVerificationCode(secret, '', '', code, '0'.repeat(64));
      throw invalidCode();
    }
    const verified = await this.transactions.run(async tx => {
      const account = await this.repository.lockAccount(tx, userId);
      if (!account || account.deletedAt || account.emailVerifiedAt) return false;
      const now = this.now();
      const row = await this.repository.findOpen(tx, userId);
      if (!row || row.expiresAt <= now || row.failedAttempts >= policy.maxWrongAttempts) return false;
      if (!matchesEmailVerificationCode(secret, userId, row.id, code, row.codeHash)) {
        const attempts = row.failedAttempts + 1;
        await this.repository.recordFailure(tx, row.id, attempts, attempts === policy.maxWrongAttempts ? now : null);
        return false;
      }
      await this.repository.consume(tx, row.id, now);
      await this.users.markEmailVerified(tx, userId);
      return true;
    });
    // Throw AFTER commit: failed attempt counters must survive invalid-code responses.
    if (!verified) throw invalidCode();
    return true;
  }
}
