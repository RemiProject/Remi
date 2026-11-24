import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '@/platform/config/env.schema.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';

const base = {
  DATABASE_URL: 'postgresql://example/local', DATABASE_URL_MIGRATOR: 'postgresql://example/migrator',
  JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32), S3_BUCKET: 'local',
};
afterEach(() => vi.restoreAllMocks());

describe('email code configuration', () => {
  it.each(['development', 'test'])('allows a missing or empty secret in %s', NODE_ENV => {
    expect(parseEnv({ ...base, NODE_ENV }).EMAIL_VERIFICATION_CODE_SECRET).toBeUndefined();
    expect(parseEnv({ ...base, NODE_ENV, EMAIL_VERIFICATION_CODE_SECRET: '' }).EMAIL_VERIFICATION_CODE_SECRET).toBeUndefined();
  });
  it('fails production startup without a secret', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow('EMAIL_VERIFICATION_CODE_SECRET');
  });
  it.each(['development', 'test', 'production'])('rejects malformed/short supplied secrets in %s', NODE_ENV => {
    for (const EMAIL_VERIFICATION_CODE_SECRET of ['!', Buffer.alloc(31).toString('base64url'), 'é'.repeat(32)]) {
      expect(() => parseEnv({ ...base, NODE_ENV, EMAIL_VERIFICATION_CODE_SECRET })).toThrow('EMAIL_VERIFICATION_CODE_SECRET');
    }
  });
  it('accepts at least 32 decoded bytes in production', () => {
    for (const bytes of [32, 64]) {
      const secret = Buffer.alloc(bytes, 3).toString('base64url');
      expect(parseEnv({ ...base, NODE_ENV: 'production', EMAIL_VERIFICATION_CODE_SECRET: secret }).EMAIL_VERIFICATION_CODE_SECRET).toBe(secret);
    }
  });
  it('warns once per startup without leaking configuration; enabled configuration does not warn', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const config = Object.create(AppConfigService.prototype) as AppConfigService;
    Object.defineProperty(config, 'env', { value: parseEnv({ ...base, NODE_ENV: 'development' }) });
    config.onModuleInit(); config.onModuleInit();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('codes are disabled');
    expect(warn.mock.calls[0][0]).toContain('link verification remains available');
    const enabled = Object.create(AppConfigService.prototype) as AppConfigService;
    Object.defineProperty(enabled, 'env', { value: parseEnv({ ...base, EMAIL_VERIFICATION_CODE_SECRET: Buffer.alloc(32).toString('base64url') }) });
    enabled.onModuleInit(); expect(warn).toHaveBeenCalledTimes(1);
  });
});
