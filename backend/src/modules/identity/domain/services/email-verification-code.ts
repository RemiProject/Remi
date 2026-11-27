import { deriveOneTimeCode, hashOneTimeCode, matchesOneTimeCode } from '@/modules/identity/domain/services/one-time-code.js';

/** Reproducible by the mail worker; the raw code never needs to enter a durable outbox payload. */
export function deriveEmailVerificationCode(secret: Buffer, userId: string, challengeId: string): string {
  return deriveOneTimeCode('email-verification', secret, userId, challengeId);
}

export function hashEmailVerificationCode(secret: Buffer, userId: string, challengeId: string, code: string): string {
  return hashOneTimeCode('email-verification', secret, userId, challengeId, code);
}

export function matchesEmailVerificationCode(secret: Buffer, userId: string, challengeId: string, code: string, hash: string): boolean {
  return matchesOneTimeCode('email-verification', secret, userId, challengeId, code, hash);
}
