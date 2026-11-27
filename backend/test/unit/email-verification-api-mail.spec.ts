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
import { ProcessEmailVerificationCodeLookupHandler } from '@/modules/identity/application/commands/process-email-verification-code-lookup/process-email-verification-code-lookup.handler.js';
import { ProcessEmailVerificationCodeLookupCommand } from '@/modules/identity/application/commands/process-email-verification-code-lookup/process-email-verification-code-lookup.command.js';
import { EmailVerificationCodeLookupHandler } from '@/modules/identity/infrastructure/handlers/email-verification-code-lookup.handler.js';
import { VerificationEmailService } from '@/modules/identity/application/services/verification-email.service.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
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

  it.each(['person@example.invalid', 'nobody@example.invalid'])('writes only one lookup row with the normalized email, for any email (%s)', async email => {
    const tx = fakeTx(); const outbox = { publish: vi.fn(async () => undefined) };
    const handler = new RequestEmailVerificationCodeHandler(tx as any, outbox as any, { isEnabled: true } as any);
    expect(await handler.execute(new RequestEmailVerificationCodeCommand(' ' + email.toUpperCase() + ' '))).toEqual({ accepted: true });
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    const [publishTx, event] = outbox.publish.mock.calls[0] as unknown as [unknown, { topic: string; dedupeKey: string; payload: Record<string, unknown> }];
    expect(publishTx).toEqual({});
    expect(event).toMatchObject({ topic: 'auth.email_verification_code_lookup', payload: { email } });
    expect(event.dedupeKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the request cannot branch on the account: no user, token or code-issuing dependency, and a new key per request', async () => {
    expect(RequestEmailVerificationCodeHandler.length).toBe(3);
    const source = readFileSync('src/modules/identity/application/commands/request-email-verification-code/request-email-verification-code.handler.ts', 'utf8');
    for (const forbidden of ['findByEmail', 'USER_REPOSITORY', 'TOKEN_REPOSITORY', 'issueWithinTransaction', 'CommandBus']) expect(source).not.toContain(forbidden);
    const outbox = { publish: vi.fn(async () => undefined) };
    const handler = new RequestEmailVerificationCodeHandler(fakeTx() as any, outbox as any, { isEnabled: true } as any);
    await handler.execute(new RequestEmailVerificationCodeCommand(user.email));
    await handler.execute(new RequestEmailVerificationCodeCommand(user.email));
    expect(new Set(outbox.publish.mock.calls.map(call => (call as any[])[1].dedupeKey)).size).toBe(2);
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

  it('accepts resend without writing anything, and rejects verify, before account lookup when the feature is disabled', async () => {
    const users = { findByEmail: vi.fn() };
    const tx = fakeTx(); const outbox = { publish: vi.fn() };
    const codes = { isEnabled: false, requireEnabled: () => { throw new Error('generic'); } };
    const resend = new RequestEmailVerificationCodeHandler(tx as any, outbox as any, codes as any);
    const verify = new VerifyEmailCodeHandler({} as any, codes as any, {} as any, users as any);
    expect(await resend.execute(new RequestEmailVerificationCodeCommand(user.email))).toEqual({ accepted: true });
    expect(tx.run).not.toHaveBeenCalled(); expect(outbox.publish).not.toHaveBeenCalled();
    await expect(verify.execute(new VerifyEmailCodeCommand(user.email, '123456'))).rejects.toThrow('generic');
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
});

function lookupHarness(found: typeof user | null, status: string, enabled = true) {
  const tx = fakeTx(); const outbox = { publish: vi.fn(), clearPayload: vi.fn() };
  const config = fakeConfig(); const tokens = { insert: vi.fn() };
  const codes = { isEnabled: enabled, issueWithinTransaction: vi.fn(async () => ({ status, challenge: { id: 'challenge-id' } })) };
  const users = { findByEmail: vi.fn(async () => found) };
  const emails = new VerificationEmailService(outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config, codes as any, tokens as any);
  const handler = new ProcessEmailVerificationCodeLookupHandler(tx as any, outbox as any, codes as any, emails, users as any);
  return { tx, outbox, tokens, codes, users, handler };
}

describe('public code request lookup worker', () => {
  it('queues the verification email with the challenge ID for an unverified account and blanks the lookup row in the same transaction', async () => {
    const h = lookupHarness(user, 'issued');
    expect(await h.handler.execute(new ProcessEmailVerificationCodeLookupCommand(7n, ' PERSON@Example.Invalid '))).toEqual({ outcome: 'queued' });
    expect(h.users.findByEmail).toHaveBeenCalledWith({}, user.email);
    expect(h.codes.issueWithinTransaction).toHaveBeenCalledWith({}, user.id);
    const [, event] = h.outbox.publish.mock.calls[0];
    expect(event.topic).toBe(OutboxTopics.EmailVerifyRequested);
    expect(event.payload).toMatchObject({ to: user.email, codeChallengeId: 'challenge-id' });
    expect(event.payload).not.toHaveProperty('code');
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
    expect(h.tx.run).toHaveBeenCalledTimes(1);
  });

  it.each(['cooldown', 'daily-cap', 'not-eligible'])('sends nothing on %s, and still blanks the lookup row', async status => {
    const h = lookupHarness(user, status);
    expect(await h.handler.execute(new ProcessEmailVerificationCodeLookupCommand(7n, user.email))).toEqual({ outcome: 'not-sent' });
    expect(h.outbox.publish).not.toHaveBeenCalled(); expect(h.tokens.insert).not.toHaveBeenCalled();
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
  });

  it('sends nothing for an unknown or deleted email, a verified account, or a blanked row on retry', async () => {
    const cases: Array<[typeof user | null, string]> = [[null, 'nobody@example.invalid'], [{ ...user, emailVerifiedAt: new Date() } as any, user.email], [user, '']];
    for (const [found, email] of cases) {
      const h = lookupHarness(found, 'issued');
      expect(await h.handler.execute(new ProcessEmailVerificationCodeLookupCommand(7n, email))).toEqual({ outcome: 'not-sent' });
      expect(h.codes.issueWithinTransaction).not.toHaveBeenCalled(); expect(h.outbox.publish).not.toHaveBeenCalled();
      expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
      if (!email) expect(h.users.findByEmail).not.toHaveBeenCalled();
    }
  });

  it('never sends a link-only email from this public path, even if codes were disabled after the request', async () => {
    const h = lookupHarness(user, 'disabled', false);
    expect(await h.handler.execute(new ProcessEmailVerificationCodeLookupCommand(7n, user.email))).toEqual({ outcome: 'not-sent' });
    expect(h.users.findByEmail).not.toHaveBeenCalled(); expect(h.outbox.publish).not.toHaveBeenCalled();
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
  });

  it('the outbox handler passes the row ID and email, and treats a blanked payload as no email', async () => {
    const commands = { execute: vi.fn(async () => ({ outcome: 'not-sent' })) };
    const handler = new EmailVerificationCodeLookupHandler(commands as any);
    await handler.handle({ id: 9n, payload: { email: user.email } } as any);
    await handler.handle({ id: 9n, payload: {} } as any);
    expect(commands.execute.mock.calls.map(([command]: any) => [command.lookupId, command.email])).toEqual([[9n, user.email], [9n, '']]);
  });
});

describe('verification email transactions and compatibility', () => {
  function resend(status: string) {
    const tx = fakeTx(); const config = fakeConfig();
    const outbox = { publish: vi.fn(async () => undefined) }; const tokens = { insert: vi.fn(async () => undefined) };
    const codes = { issueWithinTransaction: vi.fn(async () => ({ status, challenge: { id: 'challenge-id' } })) };
    const emails = new VerificationEmailService(outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config, codes as any, tokens as any);
    const handler = new RequestEmailVerificationHandler(tx as any, { findById: async () => user } as any, emails);
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
