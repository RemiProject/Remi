import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validateSync } from 'class-validator';
import { AuthResolver } from '@/modules/identity/presentation/resolvers/auth.resolver.js';
import { VerifyPasswordResetCodeInput } from '@/modules/identity/presentation/inputs/identity.inputs.js';
import { VerifyPasswordResetCodeCommand } from '@/modules/identity/application/commands/verify-password-reset-code/verify-password-reset-code.command.js';
import { VerifyPasswordResetCodeHandler } from '@/modules/identity/application/commands/verify-password-reset-code/verify-password-reset-code.handler.js';
import { ResetPasswordHandler } from '@/modules/identity/application/commands/reset-password/reset-password.handler.js';
import { ResetPasswordCommand } from '@/modules/identity/application/commands/reset-password/reset-password.command.js';
import { EmailVerifiedEvent, PasswordChangedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { formatGraphQLError } from '@/platform/graphql/error-mapper.js';
import { DomainError } from '@/shared/domain-error.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';

const resetError = () => new DomainError('INVALID_PASSWORD_RESET_CODE', 'The reset code is invalid or expired.', 422);

describe('verifyPasswordResetCode at the GraphQL boundary', () => {
  it('is public and throttled exactly like verifyEmailCode and login', () => {
    const method = AuthResolver.prototype.verifyPasswordResetCode;
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toBeUndefined();
    const keys = Reflect.getMetadataKeys(AuthResolver.prototype.verifyEmailCode).filter((key: string) => key.startsWith('THROTTLER:'));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(Reflect.getMetadata(key, method)).toBe(Reflect.getMetadata(key, AuthResolver.prototype.verifyEmailCode));
      expect(Reflect.getMetadata(key, method)).toBe(Reflect.getMetadata(key, AuthResolver.prototype.login));
    }
  });

  it('accepts any string shape, so malformed input reaches the service and its generic error', () => {
    for (const [email, code] of [['not-an-email', 'abc'], ['', ''], ['x@y.z', '1'.repeat(300)], [' a@b.co ', '012345']]) {
      expect(validateSync(Object.assign(new VerifyPasswordResetCodeInput(), { email, code }))).toHaveLength(0);
    }
  });

  it('passes the input fields to the command and returns the reset token result', async () => {
    const result = { resetToken: 'token', expiresAt: new Date('2026-11-27T12:10:00Z') };
    const commands = { execute: vi.fn(async () => result) };
    const resolver = new AuthResolver(commands as any, {} as any);
    expect(await resolver.verifyPasswordResetCode(Object.assign(new VerifyPasswordResetCodeInput(), { email: 'a@b.co', code: '012345' }))).toBe(result);
    const [command] = commands.execute.mock.calls[0] as unknown as [VerifyPasswordResetCodeCommand];
    expect(command).toBeInstanceOf(VerifyPasswordResetCodeCommand);
    expect([command.email, command.code]).toEqual(['a@b.co', '012345']);
  });

  it('the handler delegates to the exchange and lets its generic error through', async () => {
    const codes = { exchange: vi.fn(async () => { throw resetError(); }) };
    const handler = new VerifyPasswordResetCodeHandler(codes as any);
    await expect(handler.execute(new VerifyPasswordResetCodeCommand('a@b.co', '000000'))).rejects.toMatchObject({ code: 'INVALID_PASSWORD_RESET_CODE' });
    expect(codes.exchange).toHaveBeenCalledWith('a@b.co', '000000');
  });

  it('maps INVALID_PASSWORD_RESET_CODE exactly like INVALID_EMAIL_VERIFICATION_CODE: its code, status 422, nothing else', () => {
    const formatted = { message: 'raw', path: ['x'], locations: [{ line: 1, column: 1 }] };
    const reset = formatGraphQLError(formatted, resetError());
    const verification = formatGraphQLError(formatted, new DomainError('INVALID_EMAIL_VERIFICATION_CODE', 'The verification code is invalid or expired.', 422));
    expect(reset).toEqual({ message: 'The reset code is invalid or expired.', path: ['x'], locations: [{ line: 1, column: 1 }], extensions: { code: 'INVALID_PASSWORD_RESET_CODE', status: 422 } });
    expect(Object.keys(reset.extensions!)).toEqual(Object.keys(verification.extensions!));
    expect(verification.extensions).toEqual({ code: 'INVALID_EMAIL_VERIFICATION_CODE', status: 422 });
  });
});

function resetHarness(emailVerifiedAt: Date | null) {
  const tx = fakeTx();
  const calls: string[] = [];
  const track = (name: string, result?: unknown) => vi.fn(async () => { calls.push(name); return result; });
  const user = { id: 'user', email: 'a@b.co', name: 'A', languageCode: 'en', emailVerifiedAt };
  const tokens = { consumeByHash: track('consumeToken', { id: 'token', userId: 'user' }), invalidateOpenForUser: track('invalidateResetTokens', 2) };
  const users = { findById: track('findUser', user), updatePassword: track('updatePassword'), markEmailVerified: track('markEmailVerified') };
  const sessions = { revokeAllForUser: track('revokeSessions', 1) };
  const outbox = { publish: track('publishPasswordChanged') };
  const resetCodes = { invalidateAllWithinTransaction: track('invalidateResetCodes') };
  const verificationCodes = { invalidateWithinTransaction: track('invalidateVerificationCodes') };
  const events = { publish: vi.fn() };
  const handler = new ResetPasswordHandler(tx as any, outbox as any, events as any, fakeConfig({ MAIL_FROM: 'AI Kitchen <no-reply@example.invalid>' }), users as any,
    tokens as any, sessions as any, { hash: async () => 'hash' } as any, resetCodes as any, verificationCodes as any);
  return { handler, tx, calls, tokens, users, outbox, resetCodes, verificationCodes, events };
}

describe('resetPassword', () => {
  it('keeps revoking sessions and queueing the password-changed email, and now also invalidates every reset token and code', async () => {
    const h = resetHarness(new Date());
    expect(await h.handler.execute(new ResetPasswordCommand('raw', 'NewPassword1!'))).toEqual({ changed: true });
    expect(h.tx.run).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['consumeToken', 'findUser', 'updatePassword', 'revokeSessions', 'invalidateResetTokens', 'invalidateResetCodes', 'invalidateVerificationCodes', 'publishPasswordChanged']);
    expect(h.tokens.invalidateOpenForUser).toHaveBeenCalledWith({}, 'user', 'PASSWORD_RESET');
    expect(h.resetCodes.invalidateAllWithinTransaction).toHaveBeenCalledWith({}, 'user');
    expect((h.outbox.publish.mock.calls[0] as unknown as [unknown, { topic: string; payload: Record<string, unknown> }])[1]).toMatchObject({
      topic: OutboxTopics.PasswordChanged, payload: { to: 'a@b.co', supportEmail: 'no-reply@example.invalid' } });
    expect(h.users.markEmailVerified).not.toHaveBeenCalled(); // already verified: the date is not overwritten
    expect(h.events.publish.mock.calls.map(([event]) => event.constructor)).toEqual([PasswordChangedEvent]);
  });

  it('marks an unverified email verified, invalidates its verification code, and publishes EmailVerifiedEvent after commit', async () => {
    const h = resetHarness(null);
    await h.handler.execute(new ResetPasswordCommand('raw', 'NewPassword1!'));
    expect(h.verificationCodes.invalidateWithinTransaction).toHaveBeenCalledWith({}, 'user');
    expect(h.users.markEmailVerified).toHaveBeenCalledWith({}, 'user');
    expect(h.calls.indexOf('markEmailVerified')).toBeLessThan(h.calls.indexOf('publishPasswordChanged'));
    expect(h.events.publish.mock.calls.map(([event]) => event.constructor)).toEqual([PasswordChangedEvent, EmailVerifiedEvent]);
  });

  it('changes nothing for an invalid token or a weak password', async () => {
    const invalid = resetHarness(null);
    invalid.tokens.consumeByHash.mockResolvedValueOnce(null as any);
    await expect(invalid.handler.execute(new ResetPasswordCommand('raw', 'NewPassword1!'))).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
    expect(invalid.tokens.consumeByHash).toHaveBeenCalledTimes(1);
    expect(invalid.calls).toEqual([]); // nothing after the failed consume
    expect(invalid.events.publish).not.toHaveBeenCalled();
    const weak = resetHarness(null);
    await expect(weak.handler.execute(new ResetPasswordCommand('raw', 'weak'))).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    expect(weak.tx.run).not.toHaveBeenCalled();
  });
});
