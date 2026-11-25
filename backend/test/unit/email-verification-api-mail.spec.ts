import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validateSync } from 'class-validator';
import { RequestEmailVerificationCodeHandler } from '@/modules/identity/application/commands/request-email-verification-code/request-email-verification-code.handler.js';
import { RequestEmailVerificationCodeCommand } from '@/modules/identity/application/commands/request-email-verification-code/request-email-verification-code.command.js';
import { VerifyEmailCodeHandler } from '@/modules/identity/application/commands/verify-email-code/verify-email-code.handler.js';
import { VerifyEmailCodeCommand } from '@/modules/identity/application/commands/verify-email-code/verify-email-code.command.js';
import { RequestEmailVerificationHandler } from '@/modules/identity/application/commands/request-email-verification/request-email-verification.handler.js';
import { RequestEmailVerificationCommand } from '@/modules/identity/application/commands/request-email-verification/request-email-verification.command.js';
import { VerifyEmailHandler } from '@/modules/identity/application/commands/verify-email/verify-email.handler.js';
import { VerifyEmailCommand } from '@/modules/identity/application/commands/verify-email/verify-email.command.js';
import { SendVerificationEmailHandler } from '@/modules/identity/infrastructure/handlers/send-verification-email.handler.js';
import { UserNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { EmailVerifiedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { AuthResolver } from '@/modules/identity/presentation/resolvers/auth.resolver.js';
import { RequestEmailVerificationCodeInput, VerifyEmailCodeInput } from '@/modules/identity/presentation/inputs/identity.inputs.js';
import { TemplateRenderer } from '@/platform/mail/template-renderer.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';

const user = { id: 'user', email: 'person@example.invalid', name: 'Person', languageCode: 'en', emailVerifiedAt: null };

describe('public verification commands and GraphQL boundary', () => {
  it('uses no auth guard and retains the same throttle metadata as login', () => {
    for (const method of [AuthResolver.prototype.requestEmailVerificationCode, AuthResolver.prototype.verifyEmailCode]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toBeUndefined();
      const keys = Reflect.getMetadataKeys(AuthResolver.prototype.login).filter((key: string) => key.startsWith('THROTTLER:'));
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(Reflect.getMetadata(key, method)).toBe(Reflect.getMetadata(key, AuthResolver.prototype.login));
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthResolver)).toBeUndefined();
  });

  it('validates email without leaking semantic code validity through a different validation error', () => {
    expect(validateSync(Object.assign(new RequestEmailVerificationCodeInput(), { email: 'not-email' })).length).toBeGreaterThan(0);
    expect(validateSync(Object.assign(new VerifyEmailCodeInput(), { email: user.email, code: 'wrong' }))).toHaveLength(0);
    expect(validateSync(Object.assign(new VerifyEmailCodeInput(), { email: user.email, code: '0'.repeat(257) })).length).toBeGreaterThan(0);
  });

  it.each([null, user, { ...user, emailVerifiedAt: new Date() }])('returns the same acceptance for unknown/known/verified users', async found => {
    const users = { findByEmail: vi.fn(async () => found) };
    const codes = { isEnabled: true };
    const commands = { execute: vi.fn(async () => ({ accepted: true })) };
    const handler = new RequestEmailVerificationCodeHandler({ db: {} } as any, codes as any, commands as any, users as any);
    expect(await handler.execute(new RequestEmailVerificationCodeCommand(' PERSON@Example.Invalid '))).toEqual({ accepted: true });
    expect(users.findByEmail).toHaveBeenCalledWith({}, user.email);
    expect(commands.execute).toHaveBeenCalledTimes(found ? 1 : 0);
  });

  it('does not reveal an account deleted between lookup and resend', async () => {
    const handler = new RequestEmailVerificationCodeHandler({ db: {} } as any, { isEnabled: true } as any,
      { execute: async () => { throw new UserNotFoundError(); } } as any, { findByEmail: async () => user } as any);
    expect(await handler.execute(new RequestEmailVerificationCodeCommand(user.email))).toEqual({ accepted: true });
  });

  it.each([null, user])('delegates verification to the generic-error policy and publishes only after success', async found => {
    const codes = { requireEnabled: vi.fn(), verify: vi.fn(async () => { throw new Error('generic'); }) };
    const events = { publish: vi.fn() };
    const handler = new VerifyEmailCodeHandler({ db: {} } as any, codes as any, events as any, { findByEmail: async () => found } as any);
    await expect(handler.execute(new VerifyEmailCodeCommand(user.email, '123456'))).rejects.toThrow('generic');
    expect(codes.verify).toHaveBeenCalledWith(found?.id ?? null, '123456'); expect(events.publish).not.toHaveBeenCalled();
    if (found) {
      codes.verify.mockResolvedValueOnce(true as never);
      expect(await handler.execute(new VerifyEmailCodeCommand(user.email, '123456'))).toEqual({ verified: true });
      expect(events.publish).toHaveBeenCalledWith(new EmailVerifiedEvent(user.id));
    }
  });

  it('accepts resend without sending, and rejects verify, before account lookup when the feature is disabled', async () => {
    const users = { findByEmail: vi.fn() };
    const commands = { execute: vi.fn() };
    const codes = { isEnabled: false, requireEnabled: () => { throw new Error('generic'); } };
    const resend = new RequestEmailVerificationCodeHandler({} as any, codes as any, commands as any, users as any);
    const verify = new VerifyEmailCodeHandler({} as any, codes as any, {} as any, users as any);
    expect(await resend.execute(new RequestEmailVerificationCodeCommand(user.email))).toEqual({ accepted: true });
    expect(commands.execute).not.toHaveBeenCalled();
    await expect(verify.execute(new VerifyEmailCodeCommand(user.email, '123456'))).rejects.toThrow('generic');
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
});

describe('verification email transactions and compatibility', () => {
  function resend(status: string) {
    const tx = fakeTx(); const config = fakeConfig();
    const outbox = { publish: vi.fn(async () => undefined) }; const tokens = { insert: vi.fn(async () => undefined) };
    const codes = { issueWithinTransaction: vi.fn(async () => ({ status, challenge: { id: 'challenge-id' } })) };
    const handler = new RequestEmailVerificationHandler(tx as any, outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config,
      { findById: async () => user } as any, tokens as any, codes as any);
    return { tx, outbox, tokens, codes, handler };
  }

  it.each(['cooldown', 'daily-cap', 'not-eligible'])('returns acceptance without a token or email on %s', async status => {
    const h = resend(status);
    expect(await h.handler.execute(new RequestEmailVerificationCommand(user.id))).toEqual({ accepted: true });
    expect(h.outbox.publish).not.toHaveBeenCalled(); expect(h.tokens.insert).not.toHaveBeenCalled();
  });

  it.each(['issued', 'disabled'])('queues code ID or legacy link only in the issuing transaction (%s)', async status => {
    const h = resend(status); await h.handler.execute(new RequestEmailVerificationCommand(user.id));
    const tx = h.codes.issueWithinTransaction.mock.calls[0][0];
    expect(h.tokens.insert.mock.calls[0][0]).toBe(tx); expect(h.outbox.publish.mock.calls[0][0]).toBe(tx);
    const payload = (h.outbox.publish.mock.calls[0] as any[])[1].payload;
    expect(payload.verifyUrl).toContain('/verify-email?token=');
    expect(payload.codeChallengeId).toBe(status === 'issued' ? 'challenge-id' : undefined);
    expect(payload).not.toHaveProperty('code'); expect(payload).not.toHaveProperty('codeHash');
  });

  it('invalidates open codes in the same transaction as successful legacy link verification', async () => {
    const tx = fakeTx(); const users = { markEmailVerified: vi.fn() }; const codes = { invalidateWithinTransaction: vi.fn() };
    const handler = new VerifyEmailHandler(tx as any, { publish: vi.fn() } as any, users as any,
      { consumeByHash: async () => ({ userId: user.id }) } as any, codes as any);
    expect(await handler.execute(new VerifyEmailCommand('legacy-token'))).toEqual({ verified: true });
    expect(codes.invalidateWithinTransaction).toHaveBeenCalledWith({}, user.id);
    expect(users.markEmailVerified).toHaveBeenCalledWith({}, user.id);
  });

  it.each(['012345', undefined])('mail worker derives a live code or sends only the valid link (%s)', async code => {
    const mail = { send: vi.fn() }; const codes = { codeForEmail: vi.fn(async () => code) };
    const handler = new SendVerificationEmailHandler(mail as any, { db: {} } as any, { isUsable: async () => true } as any, codes as any);
    await handler.handle({ payload: { tokenId: 'token', codeChallengeId: 'challenge', to: user.email, verifyUrl: 'https://example.invalid/verify-email?token=legacy' } } as any);
    expect(codes.codeForEmail).toHaveBeenCalledWith('challenge');
    expect(mail.send.mock.calls[0][0].vars.code).toBe(code);
    expect(mail.send.mock.calls[0][0].vars.verifyUrl).toContain('token=legacy');
  });

  it('handles old link-only outbox messages, and skips used/expired link tokens', async () => {
    const mail = { send: vi.fn() }; const codes = { codeForEmail: vi.fn() }; const tokens = { isUsable: vi.fn(async () => true) };
    const handler = new SendVerificationEmailHandler(mail as any, { db: {} } as any, tokens as any, codes as any);
    await handler.handle({ payload: { tokenId: 'token' } } as any);
    expect(codes.codeForEmail).not.toHaveBeenCalled(); expect(mail.send).toHaveBeenCalledTimes(1);
    tokens.isUsable.mockResolvedValue(false);
    await handler.handle({ payload: { tokenId: 'token', codeChallengeId: 'challenge' } } as any);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it.each(['en', 'ar'])('renders code plus link and legacy link-only emails in %s', async lang => {
    const renderer = new TemplateRenderer(fakeConfig({ MAIL_TEMPLATES_DIR: `${process.cwd()}/src/platform/mail/templates/emails` }));
    await renderer.onModuleInit();
    const vars = { name: 'Test', code: '012345', verifyUrl: 'https://example.invalid/verify-email?token=legacy', expiresInHours: 24 };
    // Handlebars escapes '=' in attributes; mail clients decode it back.
    const html = renderer.render('verify-email', lang, vars).html.replaceAll('&#x3D;', '=');
    expect(html).toContain('data-verification-code="012345"'); expect(html).toContain('dir="ltr"'); expect(html).toContain(`href="${vars.verifyUrl}"`); expect(html).toContain('15');
    const legacy = renderer.render('verify-email', lang, { ...vars, code: undefined }).html.replaceAll('&#x3D;', '=');
    expect(legacy).not.toContain('data-verification-code'); expect(legacy).toContain(`href="${vars.verifyUrl}"`);
    expect(readFileSync(`src/platform/mail/templates/emails/${lang}/verify-email.hbs`, 'utf8')).toContain('{{#if code}}');
  });
});
