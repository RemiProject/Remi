import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { deriveEmailVerificationCode, hashEmailVerificationCode, matchesEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { emailVerificationCodePolicy as policy } from '@/modules/identity/application/services/email-verification-code.config.js';
import type { EmailVerificationCodeRecord } from '@/modules/identity/domain/ports/email-verification-code.repository.js';

const secret = Buffer.alloc(32, 7);
const genericError = { code: 'INVALID_EMAIL_VERIFICATION_CODE', message: 'The verification code is invalid or expired.' };

function harness(enabled = true) {
  let now = new Date('2026-11-24T12:00:00Z');
  let verified = false;
  let deleted = false;
  let exists = true;
  let commits = 0;
  const rows: EmailVerificationCodeRecord[] = [];
  const tx = {};
  const repository = {
    lockAccount: vi.fn(async () => exists ? { emailVerifiedAt: verified ? now : null, deletedAt: deleted ? now : null } : null),
    issuanceHistory: vi.fn(async () => ({
      lastIssuedAt: rows.at(-1)?.createdAt ?? null,
      count: rows.filter(row => row.createdAt.getTime() > now.getTime() - policy.dailyWindowMs && row.createdAt <= now).length,
    })),
    findOpen: vi.fn(async () => rows.find(row => !row.usedAt && !row.invalidatedAt) ?? null),
    recentCodes: vi.fn(async (_tx: unknown, _userId: string, since: Date) => rows.filter(row => row.createdAt > since)),
    invalidateOpen: vi.fn(async () => { rows.filter(row => !row.usedAt && !row.invalidatedAt).forEach(row => { row.invalidatedAt = now; }); }),
    insert: vi.fn(async (_tx: unknown, row: EmailVerificationCodeRecord) => { rows.push(row); }),
    recordFailure: vi.fn(async (_tx: unknown, id: string, failedAttempts: number, invalidatedAt: Date | null) => {
      Object.assign(rows.find(row => row.id === id)!, { failedAttempts, invalidatedAt });
    }),
    consume: vi.fn(async (_tx: unknown, id: string) => { rows.find(row => row.id === id)!.usedAt = now; }),
  };
  const transactions = { run: vi.fn(async (fn: (tx: any) => Promise<any>) => { const result = await fn(tx); commits++; return result; }) };
  const users = { markEmailVerified: vi.fn(async () => { verified = true; }) };
  const service = new EmailVerificationCodeService({ env: { EMAIL_VERIFICATION_CODE_SECRET: enabled ? secret.toString('base64url') : undefined } } as any,
    transactions as any, repository, users as any);
  vi.spyOn(service as any, 'now').mockImplementation(() => new Date(now));
  return { service, repository, transactions, users, rows, tx,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
    code: () => deriveEmailVerificationCode(secret, 'user', rows.at(-1)!.id),
    wrongCode: () => (deriveEmailVerificationCode(secret, 'user', rows.at(-1)!.id) === '000000' ? '000001' : '000000'),
    setVerified: () => { verified = true; }, setDeleted: () => { deleted = true; }, setMissing: () => { exists = false; },
    commits: () => commits,
  };
}

describe('email verification code cryptography', () => {
  it('reproduces six digits including leading zeros, bound to secret, challenge and user', () => {
    let leadingZero = false;
    for (let i = 0; i < 100; i++) {
      const code = deriveEmailVerificationCode(secret, 'user', String(i));
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(deriveEmailVerificationCode(secret, 'user', String(i))).toBe(code);
      leadingZero ||= code.startsWith('0');
      const hash = hashEmailVerificationCode(secret, 'user', String(i), code);
      expect(hash).not.toBe(createHash('sha256').update(code).digest('hex'));
      expect(matchesEmailVerificationCode(secret, 'user', String(i), code, hash)).toBe(true);
      expect(matchesEmailVerificationCode(Buffer.alloc(32, 8), 'user', String(i), code, hash)).toBe(false);
      expect(matchesEmailVerificationCode(secret, 'other', String(i), code, hash)).toBe(false);
      expect(matchesEmailVerificationCode(secret, 'user', 'other', code, hash)).toBe(false);
    }
    expect(leadingZero).toBe(true);
  });

  it('rejects malformed codes/hashes without numeric coercion', () => {
    const hash = hashEmailVerificationCode(secret, 'user', 'challenge', '000123');
    for (const code of ['123', '000123 ', '١٢٣٤٥٦', 'abcdef', '1234567']) {
      expect(matchesEmailVerificationCode(secret, 'user', 'challenge', code, hash)).toBe(false);
    }
    expect(matchesEmailVerificationCode(secret, 'user', 'challenge', '000123', 'not-a-hash')).toBe(false);
  });
});

describe('email verification foundation', () => {
  it('inserts an explicit 15-minute timestamp pair and only a hash; caller can share its transaction', async () => {
    const h = harness();
    const result = await h.service.issueWithinTransaction(h.tx as any, 'user');
    expect(result.status).toBe('issued');
    expect(h.rows[0].expiresAt.getTime() - h.rows[0].createdAt.getTime()).toBe(15 * 60_000);
    expect(h.rows[0].codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(h.rows[0])).not.toContain('code');
    expect(JSON.stringify(result)).not.toContain(`"code":"${h.code()}"`);
    expect(h.repository.insert.mock.calls[0][0]).toBe(h.tx);
    expect(h.transactions.run).not.toHaveBeenCalled();
  });

  it('verifies once and marks the user verified', async () => {
    const h = harness(); await h.service.issue('user');
    expect(await h.service.verify('user', h.code())).toBe(true);
    expect(h.rows[0].usedAt).not.toBeNull();
    expect(h.users.markEmailVerified).toHaveBeenCalledWith(h.tx, 'user');
    await expect(h.service.verify('user', h.code())).rejects.toMatchObject(genericError);
  });

  it('commits wrong attempts before returning the generic error; fifth failure kills the code', async () => {
    const h = harness(); await h.service.issue('user');
    const correct = h.code();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(h.service.verify('user', h.wrongCode())).rejects.toMatchObject(genericError);
      expect(h.rows[0].failedAttempts).toBe(attempt);
      expect(h.commits()).toBe(attempt + 1);
    }
    expect(h.rows[0].invalidatedAt).not.toBeNull();
    await expect(h.service.verify('user', correct)).rejects.toMatchObject(genericError);
    expect(h.users.markEmailVerified).not.toHaveBeenCalled();
  });

  it.each([15 * 60_000, 15 * 60_000 + 1])('rejects at/after expiry (%i ms)', async elapsed => {
    const h = harness(); await h.service.issue('user'); const code = h.code(); h.advance(elapsed);
    await expect(h.service.verify('user', code)).rejects.toMatchObject(genericError);
    expect(h.rows[0].failedAttempts).toBe(0);
  });

  it('accepts immediately before expiry', async () => {
    const h = harness(); await h.service.issue('user'); h.advance(15 * 60_000 - 1);
    expect(await h.service.verify('user', h.code())).toBe(true);
  });

  it('enforces 60 seconds, then invalidates the old challenge on resend', async () => {
    const h = harness(); await h.service.issue('user');
    h.advance(59_999); expect(await h.service.issue('user')).toEqual({ status: 'cooldown' });
    h.advance(1); expect((await h.service.issue('user')).status).toBe('issued');
    expect(h.rows).toHaveLength(2); expect(h.rows[0].invalidatedAt).not.toBeNull();
    expect(h.rows[1].id).not.toBe(h.rows[0].id);
    expect(h.rows[1].failedAttempts).toBe(0);
  });

  it('counts invalidated/used challenges toward ten issuances in a rolling 24-hour window', async () => {
    const h = harness();
    for (let i = 0; i < 10; i++) { expect((await h.service.issue('user')).status).toBe('issued'); h.advance(60_000); }
    expect(await h.service.issue('user')).toEqual({ status: 'daily-cap' });
    h.advance(policy.dailyWindowMs - 10 * 60_000 - 1);
    expect(await h.service.issue('user')).toEqual({ status: 'daily-cap' });
    h.advance(1); expect((await h.service.issue('user')).status).toBe('issued');
  });

  it('does not accidentally reuse the digits of an invalidated but recently issued code', async () => {
    const h = harness(); await h.service.issue('user');
    const previousId = h.rows[0].id;
    const oldCode = h.code();
    h.advance(60_000);
    const id = vi.spyOn(h.service as any, 'newChallengeId');
    id.mockReturnValueOnce(previousId); // Force the first candidate to reproduce the old digits.
    expect((await h.service.issue('user')).status).toBe('issued');
    expect(id).toHaveBeenCalledTimes(2);
    expect(h.code()).not.toBe(oldCode);
    await expect(h.service.verify('user', oldCode)).rejects.toMatchObject(genericError);
  });

  it.each(['setVerified', 'setDeleted', 'setMissing'] as const)('does not issue to an ineligible account (%s)', async change => {
    const h = harness(); h[change]();
    expect(await h.service.issue('user')).toEqual({ status: 'not-eligible' });
    expect(h.repository.insert).not.toHaveBeenCalled();
    await expect(h.service.verify('user', '123456')).rejects.toMatchObject(genericError);
  });

  it('unknown email/user has the same generic verification error', async () => {
    const h = harness();
    await expect(h.service.verify(null, '123456')).rejects.toMatchObject(genericError);
    expect(h.transactions.run).not.toHaveBeenCalled();
  });

  it('missing development/test secret disables issuance and verification without writes', async () => {
    const h = harness(false);
    expect(await h.service.issue('user')).toEqual({ status: 'disabled' });
    expect(await h.service.issueWithinTransaction(h.tx as any, 'user')).toEqual({ status: 'disabled' });
    await expect(h.service.verify('user', '123456')).rejects.toMatchObject(genericError);
    expect(h.transactions.run).not.toHaveBeenCalled();
    expect(h.repository.lockAccount).not.toHaveBeenCalled();
  });
});
