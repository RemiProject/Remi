import { describe, expect, it } from 'vitest';
import { deriveEmailVerificationCode, hashEmailVerificationCode, matchesEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { deriveOneTimeCode, hashOneTimeCode, matchesOneTimeCode } from '@/modules/identity/domain/services/one-time-code.js';

const secret = Buffer.alloc(32, 7);

describe('one-time code purposes', () => {
  // Captured from the implementation merged in 66aeee2, before purposes existed. Open verification codes depend on these.
  it.each([
    ['user', 'challenge', '505148', '982238c3712cee28359d2a3ed654da43b09bcd9ccf2eeddf3424f5f802422334'],
    ['01a2143d-9ef8-7467-a8ff-f30e0c655c50', '0192f1a0-0000-7000-8000-000000000001', '169533', 'a7c21837ddc6b41cd00d9ebcbde844baf409f189e15358f7c7ff64903facbad2'],
  ])('keeps email verification codes and hashes byte for byte (%s)', (userId, challengeId, code, hash) => {
    expect(deriveEmailVerificationCode(secret, userId, challengeId)).toBe(code);
    expect(hashEmailVerificationCode(secret, userId, challengeId, code)).toBe(hash);
    expect(deriveOneTimeCode('email-verification', secret, userId, challengeId)).toBe(code);
    expect(hashOneTimeCode('email-verification', secret, userId, challengeId, code)).toBe(hash);
  });

  it('separates password reset from email verification for the same secret, user and challenge', () => {
    let sameDigits = 0;
    for (let i = 0; i < 200; i++) {
      const challenge = `challenge-${i}`;
      const verification = deriveEmailVerificationCode(secret, 'user', challenge);
      const reset = deriveOneTimeCode('password-reset', secret, 'user', challenge);
      expect(reset).toMatch(/^[0-9]{6}$/);
      if (reset === verification) sameDigits++;
      const verificationHash = hashEmailVerificationCode(secret, 'user', challenge, verification);
      const resetHash = hashOneTimeCode('password-reset', secret, 'user', challenge, reset);
      // Even identical digits never produce the same stored hash under the other purpose.
      expect(hashOneTimeCode('password-reset', secret, 'user', challenge, verification)).not.toBe(verificationHash);
      expect(matchesOneTimeCode('password-reset', secret, 'user', challenge, verification, verificationHash)).toBe(false);
      expect(matchesEmailVerificationCode(secret, 'user', challenge, reset, resetHash)).toBe(false);
      expect(matchesOneTimeCode('password-reset', secret, 'user', challenge, reset, resetHash)).toBe(true);
    }
    expect(sameDigits).toBeLessThan(3); // independent 6-digit values coincide about once in a million
  });

  it('keeps the strict format check for every purpose', () => {
    const hash = hashOneTimeCode('password-reset', secret, 'user', 'challenge', '000123');
    for (const code of ['123', '000123 ', '١٢٣٤٥٦', 'abcdef', '1234567']) expect(matchesOneTimeCode('password-reset', secret, 'user', 'challenge', code, hash)).toBe(false);
    expect(matchesOneTimeCode('password-reset', secret, 'user', 'challenge', '000123', 'not-a-hash')).toBe(false);
  });
});
