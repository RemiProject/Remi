import { createHmac, timingSafeEqual } from 'node:crypto';

export type OneTimeCodePurpose = 'email-verification' | 'password-reset';

/**
 * Domain separation: each purpose has its own HMAC labels, so a code or hash made for one purpose never matches another.
 * The email-verification labels are the original ones and must never change: open codes depend on them.
 */
const labels: Record<OneTimeCodePurpose, { generate: string; verify: string }> = {
  'email-verification': { generate: 'email-code-generate-v1', verify: 'email-code-verify-v1' },
  'password-reset': { generate: 'password-reset-code-generate-v1', verify: 'password-reset-code-verify-v1' },
};

const digest = (secret: Buffer, parts: string[]) => createHmac('sha256', secret).update(parts.join('\0')).digest();

/** Reproducible by the mail worker; the raw code never needs to enter a durable outbox payload. */
export function deriveOneTimeCode(purpose: OneTimeCodePurpose, secret: Buffer, userId: string, challengeId: string): string {
  // Rejection sampling avoids modulo bias. Challenge IDs are random, independent UUIDs.
  const ceiling = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  for (let counter = 0; ; counter++) {
    const value = digest(secret, [labels[purpose].generate, userId, challengeId, String(counter)]).readUInt32BE(0);
    if (value < ceiling) return String(value % 1_000_000).padStart(6, '0');
  }
}

export function hashOneTimeCode(purpose: OneTimeCodePurpose, secret: Buffer, userId: string, challengeId: string, code: string): string {
  return digest(secret, [labels[purpose].verify, userId, challengeId, code]).toString('hex');
}

export function matchesOneTimeCode(purpose: OneTimeCodePurpose, secret: Buffer, userId: string, challengeId: string, code: string, hash: string): boolean {
  const candidate = Buffer.from(hashOneTimeCode(purpose, secret, userId, challengeId, code), 'hex');
  const expected = Buffer.from(hash, 'hex');
  const equal = expected.length === candidate.length && timingSafeEqual(expected, candidate);
  return /^[0-9]{6}$/.test(code) && equal;
}
