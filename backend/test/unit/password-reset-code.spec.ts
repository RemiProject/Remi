import { describe, expect, it, vi } from 'vitest';
import { deriveOneTimeCode, hashOneTimeCode } from '@/modules/identity/domain/services/one-time-code.js';
import { deriveEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { passwordResetCodePolicy as policy } from '@/modules/identity/application/services/password-reset-code.config.js';
import type { PasswordResetCodeRecord } from '@/modules/identity/domain/ports/password-reset-code.repository.js';

const secret = Buffer.alloc(32, 7);
const email = 'reset@example.invalid';
const genericError = { code: 'INVALID_PASSWORD_RESET_CODE', message: 'The reset code is invalid or expired.' };

function harness(enabled = true) {
  let now = new Date('2026-11-27T12:00:00Z');
  let deleted = false;
  let exists = true;
  let commits = 0;
  const rows: PasswordResetCodeRecord[] = [];
  const tokens: Array<{ id: string; userId: string | null; purpose: string; tokenHash: string; expiresAt: Date }> = [];
  const tx = {};
  const repository = {
    lockAccount: vi.fn(async () => exists ? { deletedAt: deleted ? now : null } : null),
    issuanceHistory: vi.fn(async (_tx: unknown, _userId: string, at: Date, windowMs: number) => ({
      lastIssuedAt: rows.at(-1)?.createdAt ?? null,
      count: rows.filter(row => row.createdAt.getTime() > at.getTime() - windowMs && row.createdAt <= at).length,
    })),
    failedAttemptsSince: vi.fn(async (_tx: unknown, _userId: string, since: Date) =>
      rows.filter(row => row.createdAt > since).reduce((sum, row) => sum + row.failedAttempts, 0)),
    findOpen: vi.fn(async () => rows.find(row => row.codeHash && !row.usedAt && !row.invalidatedAt) ?? null),
    findById: vi.fn(async (_tx: unknown, id: string) => rows.find(row => row.id === id) ?? null),
    recentCodes: vi.fn(async (_tx: unknown, _userId: string, since: Date) =>
      rows.filter(row => row.codeHash && row.createdAt > since).map(row => ({ id: row.id, codeHash: row.codeHash! }))),
    invalidateOpen: vi.fn(async () => { rows.filter(row => !row.usedAt && !row.invalidatedAt).forEach(row => { row.invalidatedAt = now; }); }),
    insert: vi.fn(async (_tx: unknown, row: PasswordResetCodeRecord) => { rows.push(row); }),
    recordFailure: vi.fn(async (_tx: unknown, id: string, failedAttempts: number, invalidatedAt: Date | null) => {
      Object.assign(rows.find(row => row.id === id)!, { failedAttempts, invalidatedAt });
    }),
    consume: vi.fn(async (_tx: unknown, id: string) => { rows.find(row => row.id === id)!.usedAt = now; }),
  };
  const transactions = { db: tx, run: vi.fn(async (fn: (tx: any) => Promise<any>) => { const result = await fn(tx); commits++; return result; }) };
  const users = {
    findByEmail: vi.fn(async (_db: unknown, address: string) => exists && !deleted && address === email ? { id: 'user' } : null),
    findById: vi.fn(async () => exists && !deleted ? { id: 'user' } : null),
  };
  const tokenRepository = { insert: vi.fn(async (_tx: unknown, row: typeof tokens[number]) => { tokens.push(row); }) };
  const config = { env: { EMAIL_VERIFICATION_CODE_SECRET: enabled ? secret.toString('base64url') : undefined, PASSWORD_RESET_TTL_MIN: 30 } } as any;
  const service = new PasswordResetCodeService(config, transactions as any, new OneTimeTokenService(config), repository, users as any, tokenRepository as any);
  vi.spyOn(service as any, 'now').mockImplementation(() => new Date(now));
  const code = () => deriveOneTimeCode('password-reset', secret, 'user', rows.at(-1)!.id);
  return { service, repository, transactions, users, tokenRepository, rows, tokens, tx,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); }, now: () => now,
    code, wrongCode: () => (code() === '000000' ? '000001' : '000000'),
    setDeleted: () => { deleted = true; }, setMissing: () => { exists = false; },
    commits: () => commits,
  };
}

/** Issues one code per call, each after the cooldown, and fails it `failures` times. */
async function failCodes(h: ReturnType<typeof harness>, perCode: number[]) {
  for (const failures of perCode) {
    expect((await h.service.issue('user')).status).toBe('issued');
    for (let i = 0; i < failures; i++) await expect(h.service.exchange(email, h.wrongCode())).rejects.toMatchObject(genericError);
    h.advance(policy.cooldownMs);
  }
}

describe('password reset code policy', () => {
  it('is 15 minutes, 5 attempts, 60 seconds, 5 per day, account lock at 10, and a 10-minute reset token', () => {
    expect(policy).toEqual({ lifetimeMs: 900_000, cooldownMs: 60_000, dailyWindowMs: 86_400_000, dailyCap: 5, maxWrongAttempts: 5, accountFailureLimit: 10, resetTokenLifetimeMs: 600_000 });
  });
});

describe('password reset code issuance', () => {
  it('stores only a keyed hash with an explicit 15-minute timestamp pair inside the caller transaction', async () => {
    const h = harness();
    const result = await h.service.issueWithinTransaction(h.tx as any, 'user');
    expect(result.status).toBe('issued');
    expect(h.rows[0].expiresAt.getTime() - h.rows[0].createdAt.getTime()).toBe(policy.lifetimeMs);
    expect(h.rows[0].codeHash).toBe(hashOneTimeCode('password-reset', secret, 'user', h.rows[0].id, h.code()));
    expect(JSON.stringify(h.rows[0])).not.toContain(h.code());
    expect(h.repository.insert.mock.calls[0][0]).toBe(h.tx);
    expect(h.transactions.run).not.toHaveBeenCalled();
  });

  it('without the secret records a link-only email that still counts, and is never verifiable', async () => {
    const h = harness(false);
    expect((await h.service.issue('user')).status).toBe('link-only');
    expect(h.rows[0].codeHash).toBeNull();
    h.advance(59_999); expect(await h.service.issue('user')).toEqual({ status: 'cooldown' });
    await expect(h.service.exchange(email, '123456')).rejects.toMatchObject(genericError);
    expect(await h.service.codeForEmail(h.rows[0].id)).toBeUndefined();
    expect(h.rows[0].failedAttempts).toBe(0);
  });

  it('enforces the 60-second cooldown, then replaces the open code', async () => {
    const h = harness(); await h.service.issue('user'); const old = h.code();
    h.advance(59_999); expect(await h.service.issue('user')).toEqual({ status: 'cooldown' });
    h.advance(1); expect((await h.service.issue('user')).status).toBe('issued');
    expect(h.rows).toHaveLength(2); expect(h.rows[0].invalidatedAt).not.toBeNull();
    await expect(h.service.exchange(email, old)).rejects.toMatchObject(genericError);
  });

  it('allows 5 reset emails per rolling 24 hours, counting link-only, used and replaced ones', async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) { expect((await h.service.issue('user')).status).toBe('issued'); h.advance(60_000); }
    expect(await h.service.issue('user')).toEqual({ status: 'daily-cap' });
    h.advance(policy.dailyWindowMs - 5 * 60_000 - 1);
    expect(await h.service.issue('user')).toEqual({ status: 'daily-cap' });
    h.advance(1); expect((await h.service.issue('user')).status).toBe('issued');
  });

  it('link-only and coded emails share one cap', async () => {
    const h = harness();
    const linkOnly = new PasswordResetCodeService({ env: { PASSWORD_RESET_TTL_MIN: 30 } } as any, h.transactions as any, new OneTimeTokenService({ env: {} } as any), h.repository, h.users as any, h.tokenRepository as any);
    vi.spyOn(linkOnly as any, 'now').mockImplementation(() => h.now());
    for (let i = 0; i < 3; i++) { expect((await linkOnly.issue('user')).status).toBe('link-only'); h.advance(60_000); }
    for (let i = 0; i < 2; i++) { expect((await h.service.issue('user')).status).toBe('issued'); h.advance(60_000); }
    expect(await h.service.issue('user')).toEqual({ status: 'daily-cap' });
    expect(await linkOnly.issue('user')).toEqual({ status: 'daily-cap' });
  });

  it('never reuses the digits of a recent code', async () => {
    const h = harness(); await h.service.issue('user');
    const previousId = h.rows[0].id; const oldCode = h.code();
    h.advance(60_000);
    const id = vi.spyOn(h.service as any, 'newChallengeId');
    id.mockReturnValueOnce(previousId);
    expect((await h.service.issue('user')).status).toBe('issued');
    expect(id).toHaveBeenCalledTimes(2);
    expect(h.code()).not.toBe(oldCode);
  });

  it.each(['setDeleted', 'setMissing'] as const)('issues nothing to an ineligible account (%s)', async change => {
    const h = harness(); h[change]();
    expect(await h.service.issue('user')).toEqual({ status: 'not-eligible' });
    expect(h.repository.insert).not.toHaveBeenCalled();
  });

  it('issues to verified and unverified accounts alike', async () => {
    const h = harness();
    expect((await h.service.issue('user')).status).toBe('issued');
    expect(h.repository.lockAccount).toHaveBeenCalled();
  });
});

describe('password reset code exchange', () => {
  it('exchanges a correct code once for a single-use PASSWORD_RESET token valid for 10 minutes', async () => {
    const h = harness(); await h.service.issue('user');
    const result = await h.service.exchange(' Reset@Example.invalid ', h.code());
    expect(h.users.findByEmail).toHaveBeenCalledWith(h.tx, email);
    expect(result.expiresAt.getTime() - h.now().getTime()).toBe(policy.resetTokenLifetimeMs);
    expect(h.tokens).toHaveLength(1);
    expect(h.tokens[0]).toMatchObject({ userId: 'user', purpose: 'PASSWORD_RESET', tokenHash: hashToken(result.resetToken), expiresAt: result.expiresAt });
    expect(result.resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.rows[0].usedAt).not.toBeNull();
    await expect(h.service.exchange(email, h.code())).rejects.toMatchObject(genericError);
    expect(h.tokens).toHaveLength(1);
  });

  it('commits each wrong attempt before the generic error; the fifth kills the code', async () => {
    const h = harness(); await h.service.issue('user'); const correct = h.code();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(h.service.exchange(email, h.wrongCode())).rejects.toMatchObject(genericError);
      expect(h.rows[0].failedAttempts).toBe(attempt);
      expect(h.commits()).toBe(attempt + 1);
    }
    expect(h.rows[0].invalidatedAt).not.toBeNull();
    await expect(h.service.exchange(email, correct)).rejects.toMatchObject(genericError);
    expect(h.tokens).toHaveLength(0);
  });

  it.each([policy.lifetimeMs, policy.lifetimeMs + 1])('rejects at or after expiry (%i ms) without counting', async elapsed => {
    const h = harness(); await h.service.issue('user'); const code = h.code(); h.advance(elapsed);
    await expect(h.service.exchange(email, code)).rejects.toMatchObject(genericError);
    expect(h.rows[0].failedAttempts).toBe(0);
  });

  it('accepts immediately before expiry', async () => {
    const h = harness(); await h.service.issue('user'); h.advance(policy.lifetimeMs - 1);
    expect((await h.service.exchange(email, h.code())).resetToken).toBeTruthy();
  });

  it('never accepts an email verification code with the same identifiers', async () => {
    const h = harness(); await h.service.issue('user');
    const verificationCode = deriveEmailVerificationCode(secret, 'user', h.rows[0].id);
    if (verificationCode !== h.code()) {
      await expect(h.service.exchange(email, verificationCode)).rejects.toMatchObject(genericError);
      expect(h.rows[0].failedAttempts).toBe(1);
    }
    expect((await h.service.exchange(email, h.code())).resetToken).toBeTruthy();
  });

  it('gives an unknown, deleted or missing account the same error, and touches no real account', async () => {
    for (const change of [null, 'setDeleted', 'setMissing'] as const) {
      const h = harness(); await h.service.issue('user'); const code = h.code(); if (change) h[change]();
      await expect(h.service.exchange(change ? email : 'other@example.invalid', code)).rejects.toMatchObject(genericError);
      expect(h.repository.lockAccount).toHaveBeenLastCalledWith(h.tx, '00000000-0000-0000-0000-000000000000');
      expect(h.rows[0]).toMatchObject({ failedAttempts: 0, usedAt: null });
      expect(h.tokens).toHaveLength(0);
    }
  });

  it('known and unknown emails, and a missing secret, all look up the email and open a transaction with a row lock', async () => {
    const work = async (h: ReturnType<typeof harness>, address: string, code: string) => {
      h.transactions.run.mockClear(); h.repository.lockAccount.mockClear(); h.users.findByEmail.mockClear();
      await h.service.exchange(address, code).catch(() => undefined);
      return { lookups: h.users.findByEmail.mock.calls.length, transactions: h.transactions.run.mock.calls.length, locks: h.repository.lockAccount.mock.calls.length };
    };
    const known = harness(); await known.service.issue('user');
    const unknown = harness(); await unknown.service.issue('user');
    const noSecret = harness(false); await noSecret.service.issue('user');
    const expected = { lookups: 1, transactions: 1, locks: 1 };
    expect(await work(known, email, known.wrongCode())).toEqual(expected);
    expect(await work(unknown, 'other@example.invalid', unknown.code())).toEqual(expected);
    expect(await work(noSecret, email, '123456')).toEqual(expected);
  });

  it('refuses a deleted account that was found just before the lock', async () => {
    const h = harness(); await h.service.issue('user'); const code = h.code();
    h.repository.lockAccount.mockResolvedValueOnce({ deletedAt: new Date() });
    await expect(h.service.exchange(email, code)).rejects.toMatchObject(genericError);
    expect(h.rows[0].usedAt).toBeNull();
  });

  it('rejects when no code is open', async () => {
    const h = harness();
    await expect(h.service.exchange(email, '123456')).rejects.toMatchObject(genericError);
  });
});

describe('account-wide reset code lock', () => {
  it('after 10 failures in the window refuses even the correct code, without counting more', async () => {
    const h = harness();
    await failCodes(h, [5, 4]);
    expect((await h.service.issue('user')).status).toBe('issued');
    await expect(h.service.exchange(email, h.wrongCode())).rejects.toMatchObject(genericError); // the 10th failure
    const locked = h.rows.at(-1)!;
    expect(locked.failedAttempts).toBe(1);
    await expect(h.service.exchange(email, h.code())).rejects.toMatchObject(genericError);
    expect(locked.failedAttempts).toBe(1);
    expect(locked.usedAt).toBeNull();
    expect(h.tokens).toHaveLength(0);
  });

  it('nine failures still allow a correct code', async () => {
    const h = harness();
    await failCodes(h, [5, 4]);
    expect((await h.service.issue('user')).status).toBe('issued');
    expect((await h.service.exchange(email, h.code())).resetToken).toBeTruthy();
  });

  it('lifts once the oldest failing code is older than the window plus one code lifetime', async () => {
    const h = harness();
    await failCodes(h, [5, 5]);
    // Rolling: when the first code's 5 failures age out, only 5 remain. Its failures happened at most one lifetime after
    // it was created, so each failure still counts for at least 24 hours.
    const firstFailedCodeCreated = h.rows[0].createdAt.getTime();
    h.advance(firstFailedCodeCreated + policy.dailyWindowMs + policy.lifetimeMs - 1 - h.now().getTime());
    expect((await h.service.issue('user')).status).toBe('issued');
    await expect(h.service.exchange(email, h.code())).rejects.toMatchObject(genericError); // 1 ms before the edge: still locked
    h.advance(1);
    expect((await h.service.exchange(email, h.code())).resetToken).toBeTruthy();
  });

  it('withholds the code from new emails while locked, so they carry only the link', async () => {
    const h = harness();
    await failCodes(h, [5, 5]);
    expect((await h.service.issue('user')).status).toBe('issued');
    expect(await h.service.codeForEmail(h.rows.at(-1)!.id)).toBeUndefined();
  });
});

describe('password reset code email re-check', () => {
  it('returns only a live code', async () => {
    const h = harness(); await h.service.issue('user');
    const first = h.rows[0];
    expect(await h.service.codeForEmail(first.id)).toBe(h.code());
    h.advance(60_000); await h.service.issue('user');
    expect(await h.service.codeForEmail(first.id)).toBeUndefined(); // replaced
    const second = h.rows[1];
    h.advance(policy.lifetimeMs - 1); expect(await h.service.codeForEmail(second.id)).toBe(h.code());
    h.advance(1); expect(await h.service.codeForEmail(second.id)).toBeUndefined(); // expired
    expect(await h.service.codeForEmail('unknown')).toBeUndefined();
  });

  it('returns nothing for a used, exhausted or deleted account code, or after a secret change', async () => {
    const used = harness(); await used.service.issue('user'); await used.service.exchange(email, used.code());
    expect(await used.service.codeForEmail(used.rows[0].id)).toBeUndefined();
    const exhausted = harness(); await exhausted.service.issue('user');
    for (let i = 0; i < 5; i++) await expect(exhausted.service.exchange(email, exhausted.wrongCode())).rejects.toMatchObject(genericError);
    expect(await exhausted.service.codeForEmail(exhausted.rows[0].id)).toBeUndefined();
    const gone = harness(); await gone.service.issue('user'); gone.setDeleted();
    expect(await gone.service.codeForEmail(gone.rows[0].id)).toBeUndefined();
    const rotated = harness(); await rotated.service.issue('user');
    vi.spyOn(rotated.service as any, 'secret', 'get').mockReturnValue(Buffer.alloc(32, 9));
    expect(await rotated.service.codeForEmail(rotated.rows[0].id)).toBeUndefined();
  });
});

describe('invalidating every reset code of an account', () => {
  it('locks the account and kills the open code, link-only rows included', async () => {
    const h = harness(); await h.service.issue('user'); const code = h.code();
    await h.service.invalidateAllWithinTransaction(h.tx as any, 'user');
    expect(h.repository.lockAccount).toHaveBeenLastCalledWith(h.tx, 'user');
    expect(h.rows.every(row => row.invalidatedAt)).toBe(true);
    await expect(h.service.exchange(email, code)).rejects.toMatchObject(genericError);
  });
});

describe('one-time token lifetime override', () => {
  it('keeps the configured link lifetime by default and accepts an explicit one', () => {
    const tokens = new OneTimeTokenService({ env: { PASSWORD_RESET_TTL_MIN: 30 } } as any);
    const now = new Date('2026-11-27T12:00:00Z');
    expect(tokens.issue('PASSWORD_RESET', 'user', now).row.expiresAt.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(tokens.issue('PASSWORD_RESET', 'user', now, 600_000).row.expiresAt.getTime() - now.getTime()).toBe(600_000);
  });
});
