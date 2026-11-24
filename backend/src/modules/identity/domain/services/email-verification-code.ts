import { createHmac, timingSafeEqual } from 'node:crypto';

const digest = (secret: Buffer, parts: string[]) => createHmac('sha256', secret).update(parts.join('\0')).digest();

/** Reproducible by the mail worker; the raw code never needs to enter a durable outbox payload. */
export function deriveEmailVerificationCode(secret: Buffer, userId: string, challengeId: string): string {
  // Rejection sampling avoids modulo bias. Challenge IDs are random, independent UUIDs.
  const ceiling = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  for (let counter = 0; ; counter++) {
    const value = digest(secret, ['email-code-generate-v1', userId, challengeId, String(counter)]).readUInt32BE(0);
    if (value < ceiling) return String(value % 1_000_000).padStart(6, '0');
  }
}

export function hashEmailVerificationCode(secret: Buffer, userId: string, challengeId: string, code: string): string {
  return digest(secret, ['email-code-verify-v1', userId, challengeId, code]).toString('hex');
}

export function matchesEmailVerificationCode(secret: Buffer, userId: string, challengeId: string, code: string, hash: string): boolean {
  const candidate = Buffer.from(hashEmailVerificationCode(secret, userId, challengeId, code), 'hex');
  const expected = Buffer.from(hash, 'hex');
  const equal = expected.length === candidate.length && timingSafeEqual(expected, candidate);
  return /^[0-9]{6}$/.test(code) && equal;
}
