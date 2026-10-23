import { describe, expect, it, vi } from 'vitest';
import { RegisterCommand } from '@/modules/identity/application/commands/register/register.command.js';
import { RegisterHandler } from '@/modules/identity/application/commands/register/register.handler.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { EmailAlreadyRegisteredError, InvalidTimezoneError, ReferenceNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { UserRegisteredEvent } from '@/modules/identity/domain/events/identity.events.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';

function setup(refs: any = { countryId: 'c', localeId: 'l', languageId: 'g', languageCode: 'ar' }) {
  const config = fakeConfig();
  const deps = {
    tx: fakeTx(),
    queryBus: { execute: vi.fn(async () => refs) },
    eventBus: { publish: vi.fn() },
    outbox: { publish: vi.fn(async () => undefined) },
    users: { create: vi.fn(async () => undefined), findByUsername: vi.fn(async () => null) },
    tokenRepo: { insert: vi.fn(async () => undefined) },
    hasher: { hash: vi.fn(async () => 'HASH'), verify: vi.fn() },
  };
  const handler = new RegisterHandler(deps.tx as any, deps.queryBus as any, deps.eventBus as any, deps.outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config, deps.users as any, deps.tokenRepo as any, deps.hasher as any);
  return { handler, deps };
}
const cmd = (over: Partial<RegisterCommand> = {}) => Object.assign(new RegisterCommand(' Ahmed@Mail.com ', 'Secret-123!', 'Ahmed', 'EG', 'ar-EG', 'Africa/Cairo', undefined, 'ahmed_test', '+201012345678'), over);

describe('RegisterHandler', () => {
  it('rejects weak passwords, invalid usernames and invalid mobile numbers before writes', async () => {
    for (const input of [{ password: 'weakpass' }, { username: 'x' }, { phoneNumber: '+123' }]) {
      const { handler, deps } = setup();
      await expect(handler.execute(cmd(input))).rejects.toBeDefined();
      expect(deps.users.create).not.toHaveBeenCalled();
    }
  });

  it('normalizes usernames and defaults hidden locale/timezone from language and phone country', async () => {
    const { handler, deps } = setup();
    await handler.execute(cmd({ username: 'Ahmed_Test', countryCode: undefined, localeCode: undefined, timezone: undefined, languageCode: 'en', phoneNumber: '+966501234567' }));
    expect(deps.users.create).toHaveBeenCalledWith({}, expect.objectContaining({ username: 'ahmed_test', phoneNumber: '+966501234567', timezone: 'Asia/Riyadh' }));
    expect(deps.queryBus.execute).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'SA', localeCode: 'en-US', languageCode: 'en' }));
  });

  it('maps a concurrent username conflict to USERNAME_TAKEN', async () => {
    const { handler, deps } = setup();
    deps.tx.run.mockRejectedValueOnce({ code: 'P2002' });
    deps.users.findByUsername.mockResolvedValueOnce({ id: 'existing' } as any);
    await expect(handler.execute(cmd())).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });
  it('creates user + token + outbox in one TX, then publishes the domain event', async () => {
    const { handler, deps } = setup();
    const { userId } = await handler.execute(cmd());

    expect(deps.tx.run).toHaveBeenCalledTimes(1);
    expect(deps.users.create).toHaveBeenCalledWith({}, expect.objectContaining({ id: userId, email: 'ahmed@mail.com', passwordHash: 'HASH' }));
    expect(deps.tokenRepo.insert).toHaveBeenCalledWith({}, expect.objectContaining({ purpose: 'EMAIL_VERIFY', userId }));
    const outbox = (deps.outbox.publish.mock.calls as any[])[0][1];
    expect(outbox.topic).toBe(OutboxTopics.EmailVerifyRequested);
    expect(outbox.payload.verifyUrl).toMatch(/^http:\/\/web\/verify-email\?token=/);
    expect(outbox.payload.lang).toBe('ar');
    expect(deps.eventBus.publish).toHaveBeenCalledWith(expect.any(UserRegisteredEvent));
  });

  it('never stores the raw token: only its hash goes to the DB', async () => {
    const { handler, deps } = setup();
    await handler.execute(cmd());
    const row = (deps.tokenRepo.insert.mock.calls as any[])[0][1];
    const url: string = (deps.outbox.publish.mock.calls as any[])[0][1].payload.verifyUrl;
    expect(url).not.toContain(row.tokenHash);
    expect(JSON.stringify(row)).not.toContain(decodeURIComponent(url.split('token=')[1]!));
  });

  it('rejects invalid timezone and unknown references before touching the DB', async () => {
    await expect(setup().handler.execute(cmd({ timezone: 'Mars/Base' }))).rejects.toBeInstanceOf(InvalidTimezoneError);
    const { handler, deps } = setup(null);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ReferenceNotFoundError);
    expect(deps.tx.run).not.toHaveBeenCalled();
  });

  it('maps a unique violation to EmailAlreadyRegistered and publishes no event', async () => {
    const { handler, deps } = setup();
    deps.tx.run.mockRejectedValueOnce({ code: 'P2002' });
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(deps.eventBus.publish).not.toHaveBeenCalled();
  });
});
