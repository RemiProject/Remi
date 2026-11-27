import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { PrismaPasswordResetCodeRepository } from '@/modules/identity/infrastructure/repositories/prisma-password-reset-code.repository.js';
import { PrismaEmailVerificationCodeRepository } from '@/modules/identity/infrastructure/repositories/prisma-email-verification-code.repository.js';
import { PrismaUserRepository } from '@/modules/identity/infrastructure/repositories/prisma-user.repository.js';
import { PrismaTokenRepository } from '@/modules/identity/infrastructure/repositories/prisma-token.repository.js';
import { PasswordResetCodeService } from '@/modules/identity/application/services/password-reset-code.service.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { passwordResetCodePolicy as policy } from '@/modules/identity/application/services/password-reset-code.config.js';
import { deriveOneTimeCode } from '@/modules/identity/domain/services/one-time-code.js';
import { deriveEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { OutboxPoller } from '@/platform/outbox/outbox.poller.js';
import { TemplateRenderer } from '@/platform/mail/template-renderer.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { RequestPasswordResetHandler } from '@/modules/identity/application/commands/request-password-reset/request-password-reset.handler.js';
import { RequestPasswordResetCommand } from '@/modules/identity/application/commands/request-password-reset/request-password-reset.command.js';
import { ProcessPasswordResetLookupHandler } from '@/modules/identity/application/commands/process-password-reset-lookup/process-password-reset-lookup.handler.js';
import { PasswordResetLookupHandler } from '@/modules/identity/infrastructure/handlers/password-reset-lookup.handler.js';
import { SendPasswordResetEmailHandler } from '@/modules/identity/infrastructure/handlers/send-password-reset-email.handler.js';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// Every run owns a NEW database, never DATABASE_URL or a pre-existing shared test database.
const databaseName = `remi_reset_code_test_${randomBytes(8).toString('hex')}`;
const secret = randomBytes(32);
let admin: pg.Pool;
let fixtures: pg.Pool;
let prisma: PrismaService;
let transactions: TransactionRunner;
let config: AppConfigService;
let databaseCreated = false;
let app: INestApplication;
let apiUrl: string;
let savedThrottleLimit: string | undefined;
const repository = new PrismaPasswordResetCodeRepository();
const users = new PrismaUserRepository();
const tokenRepository = new PrismaTokenRepository();
const genericError = { code: 'INVALID_PASSWORD_RESET_CODE', message: 'The reset code is invalid or expired.' };

beforeAll(async () => {
  const source = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
  if (!source || process.env.NODE_ENV === 'production') throw new Error('Local migration credentials are required for the disposable integration database.');
  const url = new URL(source);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Integration tests require a loopback PostgreSQL host.');
  admin = new pg.Pool({ connectionString: source, max: 1 });
  if (!/^remi_reset_code_test_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe test database name.');
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  url.pathname = `/${databaseName}`;
  const dedicatedUrl = url.toString();
  const env = { ...process.env, DATABASE_URL: dedicatedUrl, DATABASE_URL_MIGRATOR: dedicatedUrl };
  execFileSync(process.execPath, ['scripts/migrate.mjs'], { env, stdio: 'pipe', timeout: 90_000 });
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed/reference.seed.ts'], { env, stdio: 'pipe', timeout: 30_000 });
  fixtures = new pg.Pool({ connectionString: dedicatedUrl });
  // Exercise repository writes with the actual non-superuser API role, not the migration role.
  url.searchParams.set('options', '-c role=kitchen_runtime');
  config = { env: { ...new AppConfigService().env, DATABASE_URL: url.toString(), EMAIL_VERIFICATION_CODE_SECRET: secret.toString('base64url') } } as AppConfigService;
  prisma = new PrismaService(config);
  await prisma.$connect();
  transactions = new TransactionRunner(prisma);
  // These tests call the public auth mutations many times from one address. The IP limit itself is covered by the
  // email-verification suite and by unit tests of the throttle metadata; here it would only cut the flows short.
  savedThrottleLimit = process.env.THROTTLE_AUTH_LIMIT;
  process.env.THROTTLE_AUTH_LIMIT = '1000';
  // Load the actual compiled module so Nest uses emitted DI metadata, exactly as the production API does.
  const { AppModule } = await import('../../dist/app.module.js');
  const { AppConfigService: CompiledConfig } = await import('../../dist/platform/config/app-config.service.js');
  const { PrismaService: CompiledPrisma } = await import('../../dist/platform/db/prisma.service.js');
  const apiConfig = Object.assign(Object.create(CompiledConfig.prototype), { env: {
    ...config.env, NODE_ENV: 'test', EMAIL_VERIFICATION_REQUIRED: false, GRAPHQL_EMIT_SCHEMA: true, ENABLE_OUTBOX_POLLER: false, RUN_BACKGROUND_JOBS: false,
    S3_AUTO_CREATE_BUCKET: false, LOG_LEVEL: 'silent', MAIL_TEMPLATES_DIR: `${process.cwd()}/src/platform/mail/templates/emails`,
  } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CompiledConfig).useValue(apiConfig)
    .overrideProvider(CompiledPrisma).useValue(prisma).compile();
  app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  apiUrl = `${await app.getUrl()}/graphql`;
});

afterAll(async () => {
  await app?.close();
  if (savedThrottleLimit === undefined) delete process.env.THROTTLE_AUTH_LIMIT; else process.env.THROTTLE_AUTH_LIMIT = savedThrottleLimit;
  await prisma?.$disconnect();
  await fixtures?.end();
  if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin?.end();
});

async function user(language = 'en') {
  const id = randomUUID();
  const email = `${id}@reset-test.invalid`;
  await fixtures.query(`INSERT INTO "User" (id,email,"passwordHash",name,"countryId","localeId","preferredLanguageId",timezone)
    SELECT $1,$2,'integration-only','Reset Test',c.id,l.id,g.id,'UTC' FROM "Country" c,"Locale" l,"Language" g
    WHERE c.code='EG' AND l.code='en-US' AND g.code=$3`, [id, email, language]);
  return { id, email };
}

function clocked(now = new Date(), serviceConfig = config, tokens = tokenRepository) {
  let clock = now;
  const service = new PasswordResetCodeService(serviceConfig, transactions, new OneTimeTokenService(serviceConfig), repository, users, tokens);
  vi.spyOn(service as any, 'now').mockImplementation(() => new Date(clock));
  return { service, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); }, now: () => clock };
}
const linkOnlyConfig = () => ({ env: { ...config.env, EMAIL_VERIFICATION_CODE_SECRET: undefined } } as AppConfigService);

async function issue(service: PasswordResetCodeService, id: string) {
  const result = await service.issue(id);
  expect(result.status).toBe('issued');
  if (result.status !== 'issued') throw new Error('Expected an issued challenge');
  return { row: result.challenge, code: deriveOneTimeCode('password-reset', secret, id, result.challenge.id) };
}
const wrong = (code: string) => code === '000000' ? '000001' : '000000';
const row = async (id: string) => (await fixtures.query('SELECT * FROM "PasswordResetCode" WHERE id=$1', [id])).rows[0];

describe('password reset codes in a dedicated migrated database', () => {
  it('migration 0036 is applied with kitchen_runtime grants, no PUBLIC access and no timestamp defaults', async () => {
    expect((await fixtures.query(`SELECT 1 FROM "_migrations" WHERE name='0036_password_reset_codes.sql'`)).rowCount).toBe(1);
    expect((await prisma.$queryRaw<Array<{ role: string }>>`SELECT current_user AS role`)[0].role).toBe('kitchen_runtime');
    const defaults = await fixtures.query(`SELECT column_default FROM information_schema.columns WHERE table_name='PasswordResetCode' AND column_name IN ('createdAt','expiresAt')`);
    expect(defaults.rows).toHaveLength(2); expect(defaults.rows.every(r => r.column_default === null)).toBe(true);
    expect((await fixtures.query(`SELECT has_table_privilege('kitchen_runtime','"PasswordResetCode"','SELECT,INSERT,UPDATE,DELETE') AS ok`)).rows[0].ok).toBe(true);
    expect((await fixtures.query(`SELECT count(*)::int AS n FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.relname='PasswordResetCode' AND a.grantee=0`)).rows[0].n).toBe(0);
  });

  it('enforces the hash format, the link-only rule, the timestamp checks and one open coded row per user', async () => {
    const { id } = await user(); const { service } = clocked(); const { row: issued } = await issue(service, id);
    const insert = (values: { codeHash?: string | null; failedAttempts?: number; usedAt?: Date | null }) => fixtures.query(
      `INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt","failedAttempts","usedAt","invalidatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
      [randomUUID(), id, values.codeHash ?? null, issued.createdAt, issued.expiresAt, values.failedAttempts ?? 0, values.usedAt ?? null]);
    await expect(insert({ codeHash: 'NOT-HEX' })).rejects.toMatchObject({ code: '23514' });
    await expect(insert({ codeHash: null, failedAttempts: 1 })).rejects.toMatchObject({ code: '23514' });
    await expect(insert({ codeHash: null, usedAt: issued.createdAt })).rejects.toMatchObject({ code: '23514' });
    await expect(fixtures.query('UPDATE "PasswordResetCode" SET "expiresAt"="createdAt" WHERE id=$1', [issued.id])).rejects.toMatchObject({ code: '23514' });
    await expect(fixtures.query('UPDATE "PasswordResetCode" SET "failedAttempts"=6 WHERE id=$1', [issued.id])).rejects.toMatchObject({ code: '23514' });
    await expect(fixtures.query(`INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), id, issued.codeHash, issued.createdAt, issued.expiresAt])).rejects.toMatchObject({ code: '23505' });
    // Open link-only rows never collide with the open coded row.
    await fixtures.query(`INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt") VALUES ($1,$2,NULL,$3,$4),($5,$2,NULL,$3,$4)`,
      [randomUUID(), id, issued.createdAt, issued.expiresAt, randomUUID()]);
    const stored = await row(issued.id);
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/); expect(stored).not.toHaveProperty('code');
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(policy.lifetimeMs);
  });

  it('deleting a user removes their reset codes', async () => {
    const { id } = await user(); const { service } = clocked(); const { row: issued } = await issue(service, id);
    await fixtures.query('DELETE FROM "User" WHERE id=$1', [id]);
    expect(await row(issued.id)).toBeUndefined();
  });

  it('exchanges a correct code for a 10-minute PASSWORD_RESET token that works exactly once', async () => {
    const { id, email } = await user(); const h = clocked(); const { row: issued, code } = await issue(h.service, id);
    const { resetToken, expiresAt } = await h.service.exchange(email.toUpperCase(), code);
    expect(expiresAt.getTime() - h.now().getTime()).toBe(policy.resetTokenLifetimeMs);
    expect((await row(issued.id)).usedAt).not.toBeNull();
    const token = (await fixtures.query('SELECT * FROM "Token" WHERE "tokenHash"=$1', [hashToken(resetToken)])).rows[0];
    expect(token).toMatchObject({ userId: id, purpose: 'PASSWORD_RESET', usedAt: null });
    expect(token.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(await transactions.run(tx => tokenRepository.consumeByHash(tx, hashToken(resetToken), 'PASSWORD_RESET'))).toMatchObject({ userId: id });
    expect(await transactions.run(tx => tokenRepository.consumeByHash(tx, hashToken(resetToken), 'PASSWORD_RESET'))).toBeNull();
    await expect(h.service.exchange(email, code)).rejects.toMatchObject(genericError);
  });

  it('commits wrong attempts; five failures kill even the correct code', async () => {
    const { id, email } = await user(); const { service } = clocked(); const { row: issued, code } = await issue(service, id);
    for (let i = 1; i <= 5; i++) {
      await expect(service.exchange(email, wrong(code))).rejects.toMatchObject(genericError);
      expect((await row(issued.id)).failedAttempts).toBe(i);
    }
    await expect(service.exchange(email, code)).rejects.toMatchObject(genericError);
    expect((await row(issued.id)).invalidatedAt).not.toBeNull();
  });

  it('enforces the cooldown, replaces the old code, and rejects at exactly 15 minutes', async () => {
    const { id, email } = await user(); const h = clocked(); const old = await issue(h.service, id);
    h.advance(59_999); expect(await h.service.issue(id)).toEqual({ status: 'cooldown' });
    h.advance(1); const next = await issue(h.service, id);
    await expect(h.service.exchange(email, old.code)).rejects.toMatchObject(genericError);
    h.advance(policy.lifetimeMs); await expect(h.service.exchange(email, next.code)).rejects.toMatchObject(genericError);
  });

  it('caps reset emails at 5 per rolling 24 hours, shared by link-only and coded emails', async () => {
    const { id } = await user(); const start = new Date();
    const linkOnly = clocked(start, linkOnlyConfig()); const coded = clocked(start);
    for (let i = 0; i < 3; i++) {
      const result = await linkOnly.service.issue(id); expect(result.status).toBe('link-only');
      linkOnly.advance(60_000); coded.advance(60_000);
    }
    for (let i = 0; i < 2; i++) { await issue(coded.service, id); coded.advance(60_000); linkOnly.advance(60_000); }
    expect(await coded.service.issue(id)).toEqual({ status: 'daily-cap' });
    expect(await linkOnly.service.issue(id)).toEqual({ status: 'daily-cap' });
    expect((await fixtures.query('SELECT count(*) FILTER (WHERE "codeHash" IS NULL)::int AS links, count(*)::int AS total FROM "PasswordResetCode" WHERE "userId"=$1', [id])).rows[0]).toEqual({ links: 3, total: 5 });
    coded.advance(policy.dailyWindowMs - 5 * 60_000 - 1); expect(await coded.service.issue(id)).toEqual({ status: 'daily-cap' });
    coded.advance(1); await issue(coded.service, id);
  });

  it('locks the account after 10 failures across codes, refuses the correct code, then lifts after the window', async () => {
    const { id, email } = await user(); const h = clocked();
    for (const failures of [5, 5]) {
      const { code } = await issue(h.service, id);
      for (let i = 0; i < failures; i++) await expect(h.service.exchange(email, wrong(code))).rejects.toMatchObject(genericError);
      h.advance(60_000);
    }
    const locked = await issue(h.service, id);
    expect(await h.service.codeForEmail(locked.row.id)).toBeUndefined();
    await expect(h.service.exchange(email, locked.code)).rejects.toMatchObject(genericError);
    expect((await row(locked.row.id))).toMatchObject({ failedAttempts: 0, usedAt: null });
    h.advance(policy.dailyWindowMs + policy.lifetimeMs);
    const fresh = await issue(h.service, id);
    expect(await h.service.codeForEmail(fresh.row.id)).toBe(fresh.code);
    expect((await h.service.exchange(email, fresh.code)).resetToken).toBeTruthy();
  });

  it('serializes simultaneous requests into one issuance', async () => {
    const { id } = await user(); const { service } = clocked();
    const results = await Promise.all(Array.from({ length: 12 }, () => service.issue(id)));
    expect(results.filter(r => r.status === 'issued')).toHaveLength(1);
    expect(results.filter(r => r.status === 'cooldown')).toHaveLength(11);
  });

  it('serializes concurrent wrong attempts at five', async () => {
    const { id, email } = await user(); const { service } = clocked(); const { row: issued, code } = await issue(service, id);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.exchange(email, wrong(code))));
    expect(results.every(r => r.status === 'rejected' && r.reason.code === genericError.code)).toBe(true);
    expect((await row(issued.id)).failedAttempts).toBe(5);
  });

  it('gives just one reset token to concurrent correct exchanges', async () => {
    const { id, email } = await user(); const { service } = clocked(); const { code } = await issue(service, id);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.exchange(email, code)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected' && r.reason.code === genericError.code)).toHaveLength(7);
    expect((await fixtures.query(`SELECT count(*)::int AS n FROM "Token" WHERE "userId"=$1 AND purpose='PASSWORD_RESET'`, [id])).rows[0].n).toBe(1);
  });

  it('rolls back the code consumption when the reset token cannot be written', async () => {
    const { id, email } = await user(); const { row: issued, code } = await issue(clocked().service, id);
    const broken = { ...tokenRepository, insert: async () => { throw new Error('test token failure'); } } as any;
    await expect(clocked(new Date(), config, broken).service.exchange(email, code)).rejects.toThrow('test token failure');
    expect((await row(issued.id)).usedAt).toBeNull();
    expect((await clocked().service.exchange(email, code)).resetToken).toBeTruthy();
  });

  it('keeps reset codes and verification codes apart for the same account', async () => {
    const { id, email } = await user();
    const verification = new EmailVerificationCodeService(config, transactions, new PrismaEmailVerificationCodeRepository(), users);
    const verificationResult = await verification.issue(id);
    expect(verificationResult.status).toBe('issued');
    if (verificationResult.status !== 'issued') return;
    const verificationCode = deriveEmailVerificationCode(secret, id, verificationResult.challenge.id);
    const { service } = clocked(); const reset = await issue(service, id);
    if (verificationCode !== reset.code) await expect(service.exchange(email, verificationCode)).rejects.toMatchObject(genericError);
    expect(await verification.verify(id, verificationCode)).toBe(true); // the verification code still works for its own purpose
    expect((await service.exchange(email, reset.code)).resetToken).toBeTruthy();
  });

  it('does not mix accounts, and refuses unknown and deleted accounts with the same error', async () => {
    const a = await user(); const b = await user(); const { service } = clocked(); const { code } = await issue(service, a.id);
    await expect(service.exchange(b.email, code)).rejects.toMatchObject(genericError);
    await expect(service.exchange('nobody@reset-test.invalid', code)).rejects.toMatchObject(genericError);
    await fixtures.query('UPDATE "User" SET "deletedAt"=now() WHERE id=$1', [a.id]);
    await expect(service.exchange(a.email, code)).rejects.toMatchObject(genericError);
    expect(await service.issue(a.id)).toEqual({ status: 'not-eligible' });
  });

  it('gives the mail worker only a live code: never replaced, used, expired, exhausted, rotated, link-only or unknown', async () => {
    const { id, email } = await user(); const h = clocked(); const old = await issue(h.service, id);
    expect(await h.service.codeForEmail(old.row.id)).toBe(old.code);
    h.advance(60_000); const next = await issue(h.service, id);
    expect(await h.service.codeForEmail(old.row.id)).toBeUndefined();
    const rotated = { env: { ...config.env, EMAIL_VERIFICATION_CODE_SECRET: randomBytes(32).toString('base64url') } } as AppConfigService;
    expect(await clocked(h.now(), rotated).service.codeForEmail(next.row.id)).toBeUndefined();
    expect(await clocked(h.now(), linkOnlyConfig()).service.codeForEmail(next.row.id)).toBeUndefined();
    h.advance(policy.lifetimeMs - 1); expect(await h.service.codeForEmail(next.row.id)).toBe(next.code);
    h.advance(1); expect(await h.service.codeForEmail(next.row.id)).toBeUndefined();
    const exhausted = await issue(h.service, id);
    for (let i = 0; i < 5; i++) await expect(h.service.exchange(email, wrong(exhausted.code))).rejects.toMatchObject(genericError);
    expect(await h.service.codeForEmail(exhausted.row.id)).toBeUndefined();
    h.advance(60_000); const used = await issue(h.service, id);
    await h.service.exchange(email, used.code);
    expect(await h.service.codeForEmail(used.row.id)).toBeUndefined();
    h.advance(60_000);
    const linkOnly = await clocked(h.now(), linkOnlyConfig()).service.issue(id);
    expect(linkOnly.status).toBe('link-only');
    if (linkOnly.status === 'link-only') expect(await h.service.codeForEmail(linkOnly.challenge.id)).toBeUndefined();
    expect(await h.service.codeForEmail(randomUUID())).toBeUndefined();
  });

  it('invalidateAll kills every open row of the account and leaves other accounts alone', async () => {
    const a = await user(); const b = await user(); const h = clocked();
    const codeA = await issue(h.service, a.id); const codeB = await issue(h.service, b.id);
    await fixtures.query(`INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt") VALUES ($1,$2,NULL,$3,$4)`,
      [randomUUID(), a.id, codeA.row.createdAt, codeA.row.expiresAt]);
    await transactions.run(tx => h.service.invalidateAllWithinTransaction(tx, a.id));
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "PasswordResetCode" WHERE "userId"=$1 AND "invalidatedAt" IS NULL', [a.id])).rows[0].n).toBe(0);
    await expect(h.service.exchange(a.email, codeA.code)).rejects.toMatchObject(genericError);
    expect((await h.service.exchange(b.email, codeB.code)).resetToken).toBeTruthy();
  });
});

/** The real request handler, outbox poller and both workers on this database. Mail is rendered with the real templates and captured. */
async function resetPipeline(serviceConfig: AppConfigService = config) {
  const outbox = new OutboxPublisher();
  const codes = new PasswordResetCodeService(serviceConfig, transactions, new OneTimeTokenService(serviceConfig), repository, users, tokenRepository);
  const renderer = new TemplateRenderer({ env: { ...serviceConfig.env, MAIL_TEMPLATES_DIR: `${process.cwd()}/src/platform/mail/templates/emails` } } as AppConfigService);
  await renderer.onModuleInit();
  const sent: Array<{ to: string; lang: string; subject: string; html: string; code?: string }> = [];
  const mail = { send: async (input: { to: string; template: string; lang: string; vars: Record<string, unknown> }) => {
    const { subject, html } = renderer.render(input.template, input.lang, input.vars);
    // Handlebars escapes '=' in attributes; mail clients decode it back.
    sent.push({ to: input.to, lang: input.lang, subject, html: html.replaceAll('&#x3D;', '='), code: input.vars.code as string | undefined });
  } };
  const lookup = new ProcessPasswordResetLookupHandler(transactions, outbox, new OneTimeTokenService(serviceConfig), new LinkBuilder(serviceConfig), serviceConfig, codes, users, tokenRepository);
  const handlers = new Map<string, { handle: (message: any) => Promise<void> }>([
    [OutboxTopics.PasswordResetLookup, new PasswordResetLookupHandler({ execute: (command: any) => lookup.execute(command) } as any)],
    [OutboxTopics.PasswordResetRequested, new SendPasswordResetEmailHandler(mail as any, transactions, tokenRepository, codes)],
  ]);
  const poller = (topics: string[]) => new OutboxPoller(prisma, { topics: () => topics, get: (topic: string) => handlers.get(topic) } as any, serviceConfig);
  const request = new RequestPasswordResetHandler(transactions, outbox);
  return {
    sent, codes,
    request: (email: string) => request.execute(new RequestPasswordResetCommand(email)),
    /** Runs the outbox until idle; `only` limits it to one topic. */
    drain: async (only?: string) => {
      const runner = poller(only ? [only] : [...handlers.keys()]);
      for (let i = 0; i < 20 && await runner.tick() > 0; i++);
    },
  };
}
const lastOutboxId = async () => BigInt((await fixtures.query('SELECT coalesce(max(id), 0)::text AS id FROM "OutboxEvent"')).rows[0].id);
const outboxSince = async (id: bigint) => (await fixtures.query('SELECT topic, payload, "processedAt" FROM "OutboxEvent" WHERE id > $1 ORDER BY id', [id.toString()])).rows;
const linkFrom = (html: string) => /href="([^"]*\/reset-password\?token=[^"]+)"/.exec(html)?.[1];

describe('requesting a password reset through the outbox', () => {
  it('a known email gets one email with a valid code and link; the outbox never holds the code, and the lookup row loses the email', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline(); const before = await lastOutboxId();
    expect(await pipeline.request(` ${email.toUpperCase()} `)).toEqual({ accepted: true });
    expect(await outboxSince(before)).toEqual([expect.objectContaining({ topic: 'auth.password_reset_lookup', payload: { email }, processedAt: null })]);
    await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    const [message] = pipeline.sent;
    expect(message.to).toBe(email); expect(message.subject).toBe('Reset your password');
    const challenge = (await fixtures.query('SELECT * FROM "PasswordResetCode" WHERE "userId"=$1', [id])).rows;
    expect(challenge).toHaveLength(1);
    const code = deriveOneTimeCode('password-reset', secret, id, challenge[0].id);
    expect(message.code).toBe(code);
    expect(message.html).toMatch(new RegExp(`<p dir="ltr" data-reset-code="${code}"[^>]*>${code}</p>`));
    expect(message.html).toContain('valid for 15 minutes');
    const link = linkFrom(message.html)!; expect(link).toBeTruthy();
    const linkToken = new URL(link).searchParams.get('token')!;
    expect((await fixtures.query('SELECT purpose, "usedAt" FROM "Token" WHERE "tokenHash"=$1', [hashToken(linkToken)])).rows[0]).toEqual({ purpose: 'PASSWORD_RESET', usedAt: null });
    const rows = await outboxSince(before);
    expect(rows.map(row => [row.topic, row.processedAt !== null])).toEqual([['auth.password_reset_lookup', true], ['auth.password_reset_requested', true]]);
    expect(rows[0].payload).toEqual({});
    expect(rows[1].payload.codeChallengeId).toBe(challenge[0].id);
    expect(JSON.stringify(rows)).not.toContain(`"${code}"`);
    // The emailed code works with the step 1 exchange.
    expect((await pipeline.codes.exchange(email, code)).resetToken).toBeTruthy();
  });

  it('an unknown email gets no email and leaves only the blanked lookup row', async () => {
    const pipeline = await resetPipeline(); const before = await lastOutboxId();
    const email = `${randomUUID()}@reset-test.invalid`;
    const counts = async () => (await fixtures.query('SELECT (SELECT count(*)::int FROM "PasswordResetCode") AS codes, (SELECT count(*)::int FROM "Token") AS tokens')).rows[0];
    const start = await counts();
    expect(await pipeline.request(email)).toEqual({ accepted: true });
    await pipeline.drain();
    expect(pipeline.sent).toHaveLength(0);
    const rows = await outboxSince(before);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topic: 'auth.password_reset_lookup', payload: {} });
    expect(rows[0].processedAt).not.toBeNull();
    expect(await counts()).toEqual(start);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "OutboxEvent" WHERE payload::text LIKE $1', [`%${email}%`])).rows[0].n).toBe(0);
  });

  it('a deleted account gets no email', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline();
    await fixtures.query('UPDATE "User" SET "deletedAt"=now() WHERE id=$1', [id]);
    await pipeline.request(email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(0);
  });

  it('requests within the 60-second cooldown send one email', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline();
    await pipeline.request(email); await pipeline.request(email); await pipeline.request(email);
    await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "PasswordResetCode" WHERE "userId"=$1', [id])).rows[0].n).toBe(1);
  });

  it('a sixth reset email in 24 hours is not sent, whether the earlier ones had codes or only links', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline();
    await fixtures.query(`INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt","invalidatedAt")
      SELECT gen_random_uuid(),$1,CASE WHEN n <= 2 THEN NULL ELSE repeat('0',64) END,now()-(n*interval '1 hour'),
        now()-(n*interval '1 hour')+interval '15 minutes',now()-(n*interval '1 hour')+interval '1 minute'
      FROM generate_series(1,5) n`, [id]);
    await pipeline.request(email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(0);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "Token" WHERE "userId"=$1', [id])).rows[0].n).toBe(0);
  });

  it('a locked account gets a link-only email', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline();
    await fixtures.query(`INSERT INTO "PasswordResetCode" (id,"userId","codeHash","createdAt","expiresAt","failedAttempts","invalidatedAt")
      SELECT gen_random_uuid(),$1,repeat('0',64),now()-(n*interval '1 hour'),now()-(n*interval '1 hour')+interval '15 minutes',5,
        now()-(n*interval '1 hour')+interval '5 minutes'
      FROM generate_series(1,2) n`, [id]);
    await pipeline.request(email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    expect(pipeline.sent[0].code).toBeUndefined();
    expect(pipeline.sent[0].html).not.toContain('data-reset-code');
    expect(linkFrom(pipeline.sent[0].html)).toBeTruthy();
  });

  it('a code invalidated between queueing and sending goes out link-only', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline();
    await pipeline.request(email);
    await pipeline.drain(OutboxTopics.PasswordResetLookup); // queued with a challenge ID, not yet sent
    await transactions.run(tx => pipeline.codes.invalidateAllWithinTransaction(tx, id));
    await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    expect(pipeline.sent[0].code).toBeUndefined();
    expect(linkFrom(pipeline.sent[0].html)).toBeTruthy();
  });

  it('without the code secret the email has the link only, and still counts toward the cooldown', async () => {
    const { id, email } = await user(); const pipeline = await resetPipeline(linkOnlyConfig());
    await pipeline.request(email); await pipeline.request(email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    expect(pipeline.sent[0].code).toBeUndefined();
    expect(linkFrom(pipeline.sent[0].html)).toBeTruthy();
    expect((await fixtures.query('SELECT "codeHash" FROM "PasswordResetCode" WHERE "userId"=$1', [id])).rows).toEqual([{ codeHash: null }]);
  });

  it('an Arabic account gets the Modern Standard Arabic email with the code left to right', async () => {
    const { email } = await user('ar'); const pipeline = await resetPipeline();
    await pipeline.request(email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    const [message] = pipeline.sent;
    expect(message.lang).toBe('ar'); expect(message.subject).toBe('إعادة تعيين كلمة المرور');
    expect(message.html).toContain('dir="rtl"');
    expect(message.html).toMatch(/<p dir="ltr" data-reset-code="[0-9]{6}"/);
    expect(message.html).toContain('صالح لمدة 15 دقيقة');
  });
});

type GqlResult = { data?: Record<string, any> | null; errors?: Array<{ message: string; extensions: { code: string; status?: number } }> };
async function gql(query: string, variables: Record<string, unknown> = {}, accessToken?: string): Promise<GqlResult> {
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ query, variables }) });
  return response.json() as Promise<GqlResult>;
}
const api = {
  register: (email: string, password: string) => gql('mutation($input:RegisterInput!){register(input:$input){userId}}', { input: {
    email, username: `reset_${randomBytes(6).toString('hex')}`, name: 'Reset Test', phoneNumber: '+201012345678', password, languageCode: 'en' } }),
  login: (email: string, password: string) => gql('mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { identifier: email, password } }),
  me: (accessToken: string) => gql('{me{id emailVerifiedAt}}', {}, accessToken),
  request: (email: string) => gql('mutation($input:RequestPasswordResetInput!){requestPasswordReset(input:$input)}', { input: { email } }),
  verify: (email: unknown, code: unknown) => gql('mutation($input:VerifyPasswordResetCodeInput!){verifyPasswordResetCode(input:$input){resetToken expiresAt}}', { input: { email, code } }),
  reset: (token: string, newPassword: string) => gql('mutation($input:ResetPasswordInput!){resetPassword(input:$input)}', { input: { token, newPassword } }),
};
const errorOf = (result: GqlResult) => ({ message: result.errors?.[0]?.message, code: result.errors?.[0]?.extensions.code, status: result.errors?.[0]?.extensions.status });
const genericApiError = { ...genericError, status: 422 };
const ageResetCodes = (userId: string) => fixtures.query(`UPDATE "PasswordResetCode" SET "createdAt"="createdAt"-interval '61 seconds',"expiresAt"="expiresAt"-interval '61 seconds' WHERE "userId"=$1`, [userId]);

async function registered(oldPassword = 'OldPassword1!') {
  const email = `${randomBytes(8).toString('hex')}@reset-api.invalid`;
  const result = await api.register(email, oldPassword);
  expect(result.errors).toBeUndefined();
  return { id: result.data!.register.userId as string, email, oldPassword };
}

describe('verifyPasswordResetCode and resetPassword through the GraphQL API', () => {
  it('request, code from the email, exchange, reset: the new password works, the old one and every other reset path stop working', async () => {
    const account = await registered(); const pipeline = await resetPipeline();
    const verificationCode = (await fixtures.query('SELECT id FROM "EmailVerificationCode" WHERE "userId"=$1 AND "usedAt" IS NULL AND "invalidatedAt" IS NULL', [account.id])).rows;
    expect(verificationCode).toHaveLength(1); // from registration
    const before = await api.login(account.email, account.oldPassword);
    const session = before.data!.login.accessToken as string;
    expect((await api.me(session)).data!.me.emailVerifiedAt).toBeNull();

    // First email: its code is exchanged for a reset token.
    expect((await api.request(account.email)).data?.requestPasswordReset).toBe(true);
    await pipeline.drain();
    expect(pipeline.sent).toHaveLength(1);
    const exchanged = await api.verify(` ${account.email.toUpperCase()} `, pipeline.sent[0].code);
    expect(exchanged.errors).toBeUndefined();
    const { resetToken, expiresAt } = exchanged.data!.verifyPasswordResetCode;
    expect(Math.abs(new Date(expiresAt).getTime() - Date.now() - policy.resetTokenLifetimeMs)).toBeLessThan(15_000);
    const firstLink = new URL(linkFrom(pipeline.sent[0].html)!).searchParams.get('token')!;

    // Second email after the cooldown: another link and an open code.
    await ageResetCodes(account.id);
    await api.request(account.email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(2);
    const secondLink = new URL(linkFrom(pipeline.sent[1].html)!).searchParams.get('token')!;
    const openCode = pipeline.sent[1].code!;

    expect((await api.reset(resetToken, 'NewPassword2!')).data?.resetPassword).toBe(true);
    // The reset token worked once only.
    expect(errorOf(await api.reset(resetToken, 'AnotherPassword3!')).code).toBe('INVALID_OR_EXPIRED_TOKEN');
    // Every other reset link and the open code stopped working.
    for (const link of [firstLink, secondLink]) expect(errorOf(await api.reset(link, 'AnotherPassword3!')).code).toBe('INVALID_OR_EXPIRED_TOKEN');
    expect(errorOf(await api.verify(account.email, openCode))).toEqual(genericApiError);
    expect((await fixtures.query(`SELECT count(*)::int AS n FROM "Token" WHERE "userId"=$1 AND purpose='PASSWORD_RESET' AND "usedAt" IS NULL`, [account.id])).rows[0].n).toBe(0);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "PasswordResetCode" WHERE "userId"=$1 AND "usedAt" IS NULL AND "invalidatedAt" IS NULL', [account.id])).rows[0].n).toBe(0);
    // The new password works and the old one fails.
    expect(errorOf(await api.login(account.email, account.oldPassword)).code).toBe('INVALID_CREDENTIALS');
    const after = await api.login(account.email, 'NewPassword2!');
    expect(after.errors).toBeUndefined();
    // Existing behaviour kept: the old session is revoked and the password-changed email is queued.
    expect(errorOf(await api.me(session)).code).toBe('UNAUTHENTICATED');
    expect((await fixtures.query(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE topic='auth.password_changed' AND payload->>'to'=$1`, [account.email])).rows[0].n).toBe(1);
    // The email is now verified, and the registration verification code no longer works.
    expect((await api.me(after.data!.login.accessToken)).data!.me.emailVerifiedAt).not.toBeNull();
    expect((await fixtures.query('SELECT "invalidatedAt" FROM "EmailVerificationCode" WHERE id=$1', [verificationCode[0].id])).rows[0].invalidatedAt).not.toBeNull();
    const verifyEmail = await gql('mutation($input:VerifyEmailCodeInput!){verifyEmailCode(input:$input)}', { input: { email: account.email,
      code: deriveEmailVerificationCode(secret, account.id, verificationCode[0].id) } });
    expect(verifyEmail.errors?.[0].extensions.code).toBe('INVALID_EMAIL_VERIFICATION_CODE');
  });

  it('a reset link from the email still works on its own, with the same invalidation and verification', async () => {
    const account = await registered(); const pipeline = await resetPipeline();
    await api.request(account.email); await pipeline.drain();
    const link = new URL(linkFrom(pipeline.sent[0].html)!).searchParams.get('token')!;
    expect((await api.reset(link, 'LinkPassword4!')).data?.resetPassword).toBe(true);
    expect(errorOf(await api.verify(account.email, pipeline.sent[0].code))).toEqual(genericApiError);
    expect((await api.login(account.email, 'LinkPassword4!')).errors).toBeUndefined();
    expect((await fixtures.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1', [account.id])).rows[0].emailVerifiedAt).not.toBeNull();
  });

  it('keeps the original verification date when the email was already verified', async () => {
    const account = await registered(); const pipeline = await resetPipeline();
    await fixtures.query(`UPDATE "User" SET "emailVerifiedAt"='2026-01-01T00:00:00Z' WHERE id=$1`, [account.id]);
    await api.request(account.email); await pipeline.drain();
    const { resetToken } = (await api.verify(account.email, pipeline.sent[0].code)).data!.verifyPasswordResetCode;
    expect((await api.reset(resetToken, 'NewPassword5!')).data?.resetPassword).toBe(true);
    expect((await fixtures.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1', [account.id])).rows[0].emailVerifiedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('wrong, malformed and replaced codes and unknown or malformed emails give one identical error; malformed codes are not counted', async () => {
    const account = await registered(); const pipeline = await resetPipeline();
    await api.request(account.email); await pipeline.drain();
    const code = pipeline.sent[0].code!;
    const results = [
      await api.verify(account.email, wrong(code)),
      await api.verify(`${randomUUID()}@reset-api.invalid`, code),
      await api.verify('not-an-email', code),
      await api.verify('', code),
      await api.verify(account.email, '12345'),
      await api.verify(account.email, 'abcdef'),
      await api.verify(account.email, `${code} `),
      await api.verify(account.email, '1'.repeat(300)),
    ];
    for (const result of results) {
      expect(result.data ?? null).toBeNull();
      expect(errorOf(result)).toEqual(genericApiError);
      expect(Object.keys(result.errors![0].extensions).sort()).toEqual(['code', 'status']);
    }
    const row = (await fixtures.query('SELECT "failedAttempts" FROM "PasswordResetCode" WHERE "userId"=$1', [account.id])).rows[0];
    expect(row.failedAttempts).toBe(1); // only the well-formed wrong code counted
    expect((await api.verify(account.email, code)).data?.verifyPasswordResetCode.resetToken).toBeTruthy();
  });

  it('the account lock applies through the mutation, and the lock-time email carries only the link', async () => {
    const account = await registered(); const pipeline = await resetPipeline();
    for (let round = 0; round < 2; round++) {
      await api.request(account.email); await pipeline.drain();
      const code = pipeline.sent.at(-1)!.code!;
      for (let i = 0; i < 5; i++) expect(errorOf(await api.verify(account.email, wrong(code)))).toEqual(genericApiError);
      await ageResetCodes(account.id);
    }
    // Locked: a fresh code is withheld from the email, and even the right code is refused without being counted.
    await api.request(account.email); await pipeline.drain();
    expect(pipeline.sent).toHaveLength(3);
    expect(pipeline.sent[2].code).toBeUndefined();
    const open = (await fixtures.query('SELECT id FROM "PasswordResetCode" WHERE "userId"=$1 AND "usedAt" IS NULL AND "invalidatedAt" IS NULL', [account.id])).rows[0];
    const rightCode = deriveOneTimeCode('password-reset', secret, account.id, open.id);
    expect(errorOf(await api.verify(account.email, rightCode))).toEqual(genericApiError);
    expect((await fixtures.query('SELECT "failedAttempts", "usedAt" FROM "PasswordResetCode" WHERE id=$1', [open.id])).rows[0]).toEqual({ failedAttempts: 0, usedAt: null });
    // The link from that email still resets the password.
    const link = new URL(linkFrom(pipeline.sent[2].html)!).searchParams.get('token')!;
    expect((await api.reset(link, 'LockedPassword6!')).data?.resetPassword).toBe(true);
  });

  it('exposes the new mutation and type in the emitted schema without changing existing ones', async () => {
    const schema = (await import('node:fs')).readFileSync('schema.graphql', 'utf8');
    expect(schema).toContain('verifyPasswordResetCode(input: VerifyPasswordResetCodeInput!): PasswordResetToken!');
    expect(schema).toMatch(/type PasswordResetToken \{[\s\S]*?expiresAt: DateTime![\s\S]*?resetToken: String![\s\S]*?\}/);
    expect(schema).toMatch(/input VerifyPasswordResetCodeInput \{[\s\S]*?code: String![\s\S]*?email: String![\s\S]*?\}/);
    expect(schema).toContain('resetPassword(input: ResetPasswordInput!): Boolean!');
    expect(schema).toContain('requestPasswordReset(input: RequestPasswordResetInput!): Boolean!');
  });
});
