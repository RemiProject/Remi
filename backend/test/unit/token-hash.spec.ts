import { describe, expect, it } from 'vitest';
import { generateRawToken, hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { backoffMs } from '@/platform/outbox/backoff.js';

describe('token hash', () => {
  it('generates unique url-safe tokens and a stable sha256 hash', () => {
    const a = generateRawToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(generateRawToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe('outbox backoff', () => {
  it('grows exponentially with jitter and is capped at 15 minutes', () => {
    expect(backoffMs(1, () => 0)).toBe(1000);
    expect(backoffMs(1, () => 1)).toBe(2000);
    expect(backoffMs(20, () => 1)).toBe(15 * 60 * 1000);
  });
});
