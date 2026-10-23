import { describe, expect, it, vi } from 'vitest';
import { isStrongPassword, isSupportedMobile, isValidUsername } from '@/modules/identity/domain/services/registration-policy.js';
import { LoginHandler } from '@/modules/identity/application/commands/login/login.handler.js';
import { LoginCommand } from '@/modules/identity/application/commands/login/login.command.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';
import { validateSync } from 'class-validator';
import { RegisterInput, ResetPasswordInput } from '@/modules/identity/presentation/inputs/identity.inputs.js';

describe('authentication policy', () => {
  it('validates password rules and required registration fields at the GraphQL input boundary', () => {
    const valid = { username: 'remy_user', phoneNumber: '+201012345678', name: 'Test User', email: 'test@example.invalid', password: 'Strong123!' };
    expect(validateSync(Object.assign(new RegisterInput(), valid))).toHaveLength(0);
    for (const password of ['weakpassword', 'Strongpass!', 'Strongpass1', 'Strong1العربية']) {
      expect(validateSync(Object.assign(new RegisterInput(), { ...valid, password })).some(e => e.property === 'password')).toBe(true);
      expect(validateSync(Object.assign(new ResetPasswordInput(), { token: 'test-token', newPassword: password })).some(e => e.property === 'newPassword')).toBe(true);
    }
    expect(validateSync(Object.assign(new RegisterInput(), { ...valid, username: undefined })).some(e => e.property === 'username')).toBe(true);
    expect(validateSync(Object.assign(new RegisterInput(), { ...valid, phoneNumber: undefined })).some(e => e.property === 'phoneNumber')).toBe(true);
  });
  it('requires uppercase, number, special character and length without changing legacy login passwords', () => {
    expect(isStrongPassword('Strong123!')).toBe(true);
    for (const weak of ['short1!', 'lowercase123!', 'NoNumber!', 'NoSpecial123', 'A1!'.repeat(44)]) expect(isStrongPassword(weak)).toBe(false);
    expect(isValidUsername('remy_user1')).toBe(true);
    for (const invalid of ['ab', '1user', 'a@user', 'MixedCase', 'a'.repeat(31)]) expect(isValidUsername(invalid)).toBe(false);
    expect(isSupportedMobile('+201012345678')).toBe(true);
    expect(isSupportedMobile('+966501234567')).toBe(true);
    expect(isSupportedMobile('+2011123')).toBe(false);
  });

  it.each([' Person@Example.com ', ' ReMy_User '])('logs in by normalized identifier %s', async identifier => {
    const user = { id: 'user', passwordHash: 'hash', emailVerifiedAt: new Date() };
    const users = { findByEmail: vi.fn(async () => user), findByUsername: vi.fn(async () => user), touchLogin: vi.fn() };
    const handler = new LoginHandler(fakeTx() as any, fakeConfig({ REFRESH_TOKEN_TTL_DAYS: 30 }), users as any,
      { insert: vi.fn() } as any, { verify: vi.fn(async () => true) } as any,
      { createRefreshToken: () => ({ hash: 'hash', raw: 'test-refresh' }), issueAccess: async () => ({ accessToken: 'test-access', expiresInSeconds: 900 }) } as any);
    expect((await handler.execute(new LoginCommand(identifier, 'legacy-password'))).accessToken).toBe('test-access');
    if (identifier.includes('@')) {
      expect(users.findByEmail).toHaveBeenCalledWith({}, 'person@example.com'); expect(users.findByUsername).not.toHaveBeenCalled();
    } else {
      expect(users.findByUsername).toHaveBeenCalledWith({}, 'remy_user'); expect(users.findByEmail).not.toHaveBeenCalled();
    }
  });
});
