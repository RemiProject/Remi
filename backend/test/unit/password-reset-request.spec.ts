import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RequestPasswordResetHandler } from '@/modules/identity/application/commands/request-password-reset/request-password-reset.handler.js';
import { RequestPasswordResetCommand } from '@/modules/identity/application/commands/request-password-reset/request-password-reset.command.js';
import { ProcessPasswordResetLookupHandler } from '@/modules/identity/application/commands/process-password-reset-lookup/process-password-reset-lookup.handler.js';
import { ProcessPasswordResetLookupCommand } from '@/modules/identity/application/commands/process-password-reset-lookup/process-password-reset-lookup.command.js';
import { PasswordResetLookupHandler } from '@/modules/identity/infrastructure/handlers/password-reset-lookup.handler.js';
import { SendPasswordResetEmailHandler } from '@/modules/identity/infrastructure/handlers/send-password-reset-email.handler.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { TemplateRenderer } from '@/platform/mail/template-renderer.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';

const account = { id: 'user', email: 'person@example.invalid', name: 'Person', languageCode: 'ar', emailVerifiedAt: null };

describe('requestPasswordReset', () => {
  it.each(['person@example.invalid', 'nobody@example.invalid'])('writes only one lookup row with the normalized email (%s)', async email => {
    const tx = fakeTx(); const outbox = { publish: vi.fn(async () => undefined) };
    const handler = new RequestPasswordResetHandler(tx as any, outbox as any);
    expect(await handler.execute(new RequestPasswordResetCommand(` ${email.toUpperCase()} `))).toEqual({ accepted: true });
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    const [publishTx, event] = outbox.publish.mock.calls[0] as unknown as [unknown, { topic: string; dedupeKey: string; payload: Record<string, unknown> }];
    expect(publishTx).toEqual({});
    expect(event.topic).toBe('auth.password_reset_lookup');
    expect(event.payload).toEqual({ email });
    expect(event.dedupeKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('known and unknown emails take exactly the same path: no lookup, no token and no code in the request', () => {
    // The handler has no user, token or code dependencies at all, so the request cannot branch on the account.
    expect(RequestPasswordResetHandler.length).toBe(2);
    const source = readFileSync('src/modules/identity/application/commands/request-password-reset/request-password-reset.handler.ts', 'utf8');
    for (const forbidden of ['findByEmail', 'USER_REPOSITORY', 'TOKEN_REPOSITORY', 'PasswordResetCodeService', 'OneTimeTokenService']) expect(source).not.toContain(forbidden);
  });

  it('uses a new key per request, so repeated requests are never merged before the limits see them', async () => {
    const outbox = { publish: vi.fn(async () => undefined) };
    const handler = new RequestPasswordResetHandler(fakeTx() as any, outbox as any);
    await handler.execute(new RequestPasswordResetCommand(account.email));
    await handler.execute(new RequestPasswordResetCommand(account.email));
    const keys = outbox.publish.mock.calls.map(call => (call as unknown as [unknown, { dedupeKey: string }])[1].dedupeKey);
    expect(new Set(keys).size).toBe(2);
  });
});

function lookupHarness(found: typeof account | null, status: string) {
  const tx = fakeTx(); const outbox = { publish: vi.fn(), clearPayload: vi.fn() };
  const config = fakeConfig({ PASSWORD_RESET_TTL_MIN: 30 });
  const codes = { issueWithinTransaction: vi.fn(async () => (status === 'issued' || status === 'link-only' ? { status, challenge: { id: 'challenge-id' } } : { status })) };
  const users = { findByEmail: vi.fn(async () => found) };
  const tokenRepo = { insert: vi.fn() };
  const handler = new ProcessPasswordResetLookupHandler(tx as any, outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config,
    codes as any, users as any, tokenRepo as any);
  return { handler, tx, outbox, codes, users, tokenRepo };
}

describe('password reset lookup worker', () => {
  it('queues the existing reset email with the challenge ID, never the code, and blanks the lookup row in the same transaction', async () => {
    const h = lookupHarness(account, 'issued');
    expect(await h.handler.execute(new ProcessPasswordResetLookupCommand(7n, ' Person@Example.Invalid '))).toEqual({ outcome: 'queued-with-code' });
    expect(h.users.findByEmail).toHaveBeenCalledWith({}, account.email);
    expect(h.codes.issueWithinTransaction).toHaveBeenCalledWith({}, account.id);
    expect(h.tokenRepo.insert.mock.calls[0][1]).toMatchObject({ userId: account.id, purpose: 'PASSWORD_RESET' });
    const [, event] = h.outbox.publish.mock.calls[0];
    expect(event.topic).toBe(OutboxTopics.PasswordResetRequested);
    expect(event.payload).toMatchObject({ to: account.email, name: account.name, lang: 'ar', expiresInMinutes: 30, codeChallengeId: 'challenge-id' });
    expect(event.payload.resetUrl).toMatch(/^http:\/\/web\/reset-password\?token=/);
    expect(event.payload).not.toHaveProperty('code'); expect(event.payload).not.toHaveProperty('codeHash');
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
    expect(h.tx.run).toHaveBeenCalledTimes(1);
  });

  it('queues a link-only email when codes are disabled', async () => {
    const h = lookupHarness(account, 'link-only');
    expect(await h.handler.execute(new ProcessPasswordResetLookupCommand(7n, account.email))).toEqual({ outcome: 'queued-link-only' });
    expect(h.outbox.publish.mock.calls[0][1].payload).not.toHaveProperty('codeChallengeId');
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
  });

  it.each(['cooldown', 'daily-cap', 'not-eligible'])('sends nothing on %s, and still blanks the lookup row', async status => {
    const h = lookupHarness(account, status);
    expect(await h.handler.execute(new ProcessPasswordResetLookupCommand(7n, account.email))).toEqual({ outcome: 'not-sent' });
    expect(h.tokenRepo.insert).not.toHaveBeenCalled(); expect(h.outbox.publish).not.toHaveBeenCalled();
    expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
  });

  it('does nothing for an unknown email, or an already blanked row on retry, except blank the row', async () => {
    for (const email of ['nobody@example.invalid', '']) {
      const h = lookupHarness(null, 'issued');
      expect(await h.handler.execute(new ProcessPasswordResetLookupCommand(7n, email))).toEqual({ outcome: 'not-sent' });
      expect(h.codes.issueWithinTransaction).not.toHaveBeenCalled(); expect(h.outbox.publish).not.toHaveBeenCalled();
      expect(h.outbox.clearPayload).toHaveBeenCalledWith({}, 7n);
      if (!email) expect(h.users.findByEmail).not.toHaveBeenCalled();
    }
  });

  it('the outbox handler passes the row ID and email, and treats a blanked payload as no email', async () => {
    const commands = { execute: vi.fn(async () => ({ outcome: 'not-sent' })) };
    const handler = new PasswordResetLookupHandler(commands as any);
    await handler.handle({ id: 9n, payload: { email: account.email } } as any);
    await handler.handle({ id: 9n, payload: {} } as any);
    expect(commands.execute.mock.calls.map(([command]: any) => [command.lookupId, command.email])).toEqual([[9n, account.email], [9n, '']]);
  });
});

describe('password reset email worker', () => {
  it.each(['012345', undefined])('re-derives the code just before sending, or sends the link only (%s)', async code => {
    const mail = { send: vi.fn() }; const codes = { codeForEmail: vi.fn(async () => code) };
    const handler = new SendPasswordResetEmailHandler(mail as any, { db: {} } as any, { isUsable: async () => true } as any, codes as any);
    await handler.handle({ payload: { tokenId: 'token', codeChallengeId: 'challenge', to: account.email, lang: 'en', name: 'Person', resetUrl: 'http://web/reset-password?token=t', expiresInMinutes: 30 } } as any);
    expect(codes.codeForEmail).toHaveBeenCalledWith('challenge');
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: account.email, template: 'reset-password', lang: 'en',
      vars: { code, codeExpiresInMinutes: 15, expiresInMinutes: 30, resetUrl: 'http://web/reset-password?token=t' } });
  });

  it('handles link-only rows, including rows queued before this change, and skips used or expired link tokens', async () => {
    const mail = { send: vi.fn() }; const codes = { codeForEmail: vi.fn() }; const tokens = { isUsable: vi.fn(async () => true) };
    const handler = new SendPasswordResetEmailHandler(mail as any, { db: {} } as any, tokens as any, codes as any);
    await handler.handle({ payload: { tokenId: 'token' } } as any);
    expect(codes.codeForEmail).not.toHaveBeenCalled(); expect(mail.send.mock.calls[0][0].vars.code).toBeUndefined();
    tokens.isUsable.mockResolvedValue(false);
    await handler.handle({ payload: { tokenId: 'token', codeChallengeId: 'challenge' } } as any);
    expect(mail.send).toHaveBeenCalledTimes(1); expect(codes.codeForEmail).not.toHaveBeenCalled();
  });
});

describe('reset password email templates', () => {
  const vars = { name: 'Test', code: '012345', codeExpiresInMinutes: 15, resetUrl: 'https://example.invalid/reset-password?token=link', expiresInMinutes: 30 };
  const render = async () => { const renderer = new TemplateRenderer(fakeConfig({ MAIL_TEMPLATES_DIR: `${process.cwd()}/src/platform/mail/templates/emails` })); await renderer.onModuleInit(); return renderer; };

  it.each(['en', 'ar'])('shows the code left to right with its 15 minutes, and keeps the link (%s)', async lang => {
    const renderer = await render();
    // Handlebars escapes '=' in attributes; mail clients decode it back.
    const html = renderer.render('reset-password', lang, vars).html.replaceAll('&#x3D;', '=');
    expect(html).toMatch(/<p dir="ltr" data-reset-code="012345"[^>]*>012345<\/p>/);
    expect(html).toContain(lang === 'en' ? 'valid for 15 minutes' : 'صالح لمدة 15 دقيقة');
    expect(html).toContain(lang === 'en' ? 'valid for 30 minutes' : 'صالح لمدة 30 دقيقة');
    expect(html).toContain(`href="${vars.resetUrl}"`);
    const linkOnly = renderer.render('reset-password', lang, { ...vars, code: undefined }).html.replaceAll('&#x3D;', '=');
    expect(linkOnly).not.toContain('data-reset-code'); expect(linkOnly).not.toContain(lang === 'en' ? '15 minutes' : '15 دقيقة');
    expect(linkOnly).toContain(`href="${vars.resetUrl}"`);
  });

  it('writes the Arabic email in Modern Standard Arabic, with the app’s word for password', async () => {
    const renderer = await render();
    const { subject, html } = renderer.render('reset-password', 'ar', vars);
    expect(subject).toBe('إعادة تعيين كلمة المرور');
    const text = `${subject} ${html} ${renderer.render('reset-password', 'ar', { ...vars, code: undefined }).html}`;
    for (const colloquial of ['كلمة السر', 'لو ', 'ما طلبتش', 'ده', 'وصلنا', 'أهلًا']) expect(text).not.toContain(colloquial);
    expect(html).toContain('dir="rtl"');
  });
});
