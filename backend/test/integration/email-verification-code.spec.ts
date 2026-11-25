import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { PrismaEmailVerificationCodeRepository } from '@/modules/identity/infrastructure/repositories/prisma-email-verification-code.repository.js';
import { PrismaUserRepository } from '@/modules/identity/infrastructure/repositories/prisma-user.repository.js';
import { PrismaTokenRepository } from '@/modules/identity/infrastructure/repositories/prisma-token.repository.js';
import { EmailVerificationCodeService } from '@/modules/identity/application/services/email-verification-code.service.js';
import { deriveEmailVerificationCode } from '@/modules/identity/domain/services/email-verification-code.js';
import { VerifyEmailHandler } from '@/modules/identity/application/commands/verify-email/verify-email.handler.js';
import { VerifyEmailCommand } from '@/modules/identity/application/commands/verify-email/verify-email.command.js';
import { RequestEmailVerificationHandler } from '@/modules/identity/application/commands/request-email-verification/request-email-verification.handler.js';
import { RequestEmailVerificationCommand } from '@/modules/identity/application/commands/request-email-verification/request-email-verification.command.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { hashToken } from '@/modules/identity/domain/services/token-hash.js';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';

// Every run owns a NEW database, never DATABASE_URL or a pre-existing shared test database.
const databaseName = `remi_email_code_test_${randomBytes(8).toString('hex')}`;
const secret = randomBytes(32);
let admin: pg.Pool;
let fixtures: pg.Pool;
let prisma: PrismaService;
let transactions: TransactionRunner;
let config: AppConfigService;
let databaseCreated = false;
let app: INestApplication;
let apiUrl: string;
let apiConfig: AppConfigService;
const repository = new PrismaEmailVerificationCodeRepository();
const users = new PrismaUserRepository();
const genericError = { code: 'INVALID_EMAIL_VERIFICATION_CODE', message: 'The verification code is invalid or expired.' };

beforeAll(async () => {
  const source = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
  if (!source || process.env.NODE_ENV === 'production') throw new Error('Local migration credentials are required for the disposable integration database.');
  const url = new URL(source);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Integration tests require a loopback PostgreSQL host.');
  admin = new pg.Pool({ connectionString: source, max: 1 });
  if (!/^remi_email_code_test_[a-f0-9]{16}$/.test(databaseName)) throw new Error('Unsafe test database name.');
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
  // Load the actual compiled module so Nest uses emitted DI metadata, exactly as the production API does.
  const { AppModule } = await import('../../dist/app.module.js');
  const { AppConfigService: CompiledConfig } = await import('../../dist/platform/config/app-config.service.js');
  const { PrismaService: CompiledPrisma } = await import('../../dist/platform/db/prisma.service.js');
  apiConfig = Object.assign(Object.create(CompiledConfig.prototype), { env: {
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
  await prisma?.$disconnect();
  await fixtures?.end();
  if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin?.end();
});

async function gql(query: string, variables: Record<string, unknown> = {}, accessToken?: string) {
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ query, variables }) });
  return response.json() as Promise<{ data?: Record<string, any>; errors?: Array<{ message: string; extensions: { code: string } }> }>;
}

const requestCode = (email: string) => gql('mutation($input:RequestEmailVerificationCodeInput!){requestEmailVerificationCode(input:$input)}', { input: { email } });
const verifyCode = (email: string, code: string) => gql('mutation($input:VerifyEmailCodeInput!){verifyEmailCode(input:$input)}', { input: { email, code } });

async function register(languageCode = 'en') {
  const suffix = randomBytes(8).toString('hex');
  const email = `${suffix}@api-code.invalid`;
  const result = await gql('mutation($input:RegisterInput!){register(input:$input){userId}}', { input: {
    email, username: `code_${suffix}`, name: 'Code Test', phoneNumber: '+201012345678', password: 'IntegrationOnly123!', languageCode,
  } });
  expect(result.errors).toBeUndefined();
  return { id: result.data!.register.userId as string, email };
}

async function user() {
  const id = randomUUID();
  await fixtures.query(`INSERT INTO "User" (id,email,"passwordHash",name,"countryId","localeId","preferredLanguageId",timezone)
    SELECT $1,$2,'integration-only','Code Test',c.id,l.id,g.id,'UTC' FROM "Country" c,"Locale" l,"Language" g
    WHERE c.code='EG' AND l.code='en-US' AND g.code='en'`, [id, `${id}@code-test.invalid`]);
  return id;
}

function clocked(now = new Date(), userRepository = users) {
  let clock = now;
  const service = new EmailVerificationCodeService(config, transactions, repository, userRepository);
  vi.spyOn(service as any, 'now').mockImplementation(() => new Date(clock));
  return { service, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

async function issue(service: EmailVerificationCodeService, id: string) {
  const result = await service.issue(id);
  expect(result.status).toBe('issued');
  if (result.status !== 'issued') throw new Error('Expected an issued challenge');
  return { row: result.challenge, code: deriveEmailVerificationCode(secret, id, result.challenge.id) };
}

const wrong = (code: string) => code === '000000' ? '000001' : '000000';

describe('email codes in a dedicated migrated database', () => {
  it('uses kitchen_runtime, explicit grants, and no timestamp defaults', async () => {
    expect((await prisma.$queryRaw<Array<{ role: string }>>`SELECT current_user AS role`)[0].role).toBe('kitchen_runtime');
    const defaults = await fixtures.query(`SELECT column_default FROM information_schema.columns WHERE table_name='EmailVerificationCode' AND column_name IN ('createdAt','expiresAt')`);
    expect(defaults.rows).toHaveLength(2); expect(defaults.rows.every(row => row.column_default === null)).toBe(true);
    const grants = await fixtures.query(`SELECT has_table_privilege('kitchen_runtime','"EmailVerificationCode"','SELECT,INSERT,UPDATE,DELETE') AS allowed`);
    expect(grants.rows[0].allowed).toBe(true);
    const acl = await fixtures.query(`SELECT count(*)::int AS n FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.relname='EmailVerificationCode' AND a.grantee=0`);
    expect(acl.rows[0].n).toBe(0);
  });

  it('persists a hash and a 15-minute lifetime, verifies once, and enforces database checks/indexes', async () => {
    const id = await user(); const { service } = clocked(); const { row, code } = await issue(service, id);
    const stored = (await fixtures.query('SELECT * FROM "EmailVerificationCode" WHERE id=$1', [row.id])).rows[0];
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/); expect(stored).not.toHaveProperty('code');
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(900_000);
    await expect(fixtures.query(`INSERT INTO "EmailVerificationCode" (id,"userId","codeHash","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), id, row.codeHash, row.createdAt, row.expiresAt])).rejects.toMatchObject({ code: '23505' });
    await expect(fixtures.query('UPDATE "EmailVerificationCode" SET "expiresAt"="createdAt" WHERE id=$1', [row.id])).rejects.toMatchObject({ code: '23514' });
    expect(await service.verify(id, code)).toBe(true);
    expect((await fixtures.query('SELECT "emailVerifiedAt" FROM "User" WHERE id=$1', [id])).rows[0].emailVerifiedAt).not.toBeNull();
    await expect(service.verify(id, code)).rejects.toMatchObject(genericError);
  });

  it('commits wrong attempts; five failures kill even the correct code', async () => {
    const id = await user(); const { service } = clocked(); const { row, code } = await issue(service, id);
    for (let i = 1; i <= 5; i++) {
      await expect(service.verify(id, wrong(code))).rejects.toMatchObject(genericError);
      expect((await fixtures.query('SELECT "failedAttempts" FROM "EmailVerificationCode" WHERE id=$1', [row.id])).rows[0].failedAttempts).toBe(i);
    }
    await expect(service.verify(id, code)).rejects.toMatchObject(genericError);
    expect((await fixtures.query('SELECT "invalidatedAt" FROM "EmailVerificationCode" WHERE id=$1', [row.id])).rows[0].invalidatedAt).not.toBeNull();
  });

  it('enforces cooldown and invalidates the old digits after resend', async () => {
    const id = await user(); const h = clocked(); const old = await issue(h.service, id);
    h.advance(59_999); expect(await h.service.issue(id)).toEqual({ status: 'cooldown' });
    h.advance(1); const next = await issue(h.service, id);
    expect(next.code).not.toBe(old.code);
    await expect(h.service.verify(id, old.code)).rejects.toMatchObject(genericError);
    expect(await h.service.verify(id, next.code)).toBe(true);
  });

  it('counts all ten sends, including invalidated codes, and opens at the rolling 24-hour boundary', async () => {
    const id = await user(); const h = clocked();
    for (let i = 0; i < 10; i++) { await issue(h.service, id); h.advance(60_000); }
    expect(await h.service.issue(id)).toEqual({ status: 'daily-cap' });
    h.advance(24 * 3_600_000 - 10 * 60_000 - 1);
    expect(await h.service.issue(id)).toEqual({ status: 'daily-cap' });
    h.advance(1); await issue(h.service, id);
  });

  it('serializes simultaneous resends into one issuance', async () => {
    const id = await user(); const { service } = clocked();
    const results = await Promise.all(Array.from({ length: 12 }, () => service.issue(id)));
    expect(results.filter(result => result.status === 'issued')).toHaveLength(1);
    expect(results.filter(result => result.status === 'cooldown')).toHaveLength(11);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "EmailVerificationCode" WHERE "userId"=$1', [id])).rows[0].n).toBe(1);
  });

  it('serializes concurrent wrong attempts at five', async () => {
    const id = await user(); const { service } = clocked(); const { row, code } = await issue(service, id);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.verify(id, wrong(code))));
    expect(results.every(result => result.status === 'rejected' && result.reason.code === genericError.code)).toBe(true);
    expect((await fixtures.query('SELECT "failedAttempts" FROM "EmailVerificationCode" WHERE id=$1', [row.id])).rows[0].failedAttempts).toBe(5);
  });

  it('permits just one concurrent successful verification', async () => {
    const id = await user(); const { service } = clocked(); const { code } = await issue(service, id);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.verify(id, code)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected' && result.reason.code === genericError.code)).toHaveLength(7);
  });

  it('does not mix accounts, and rejects at exactly 15 minutes', async () => {
    const a = await user(); const b = await user(); const h = clocked(); const { code } = await issue(h.service, a);
    await expect(h.service.verify(b, code)).rejects.toMatchObject(genericError);
    await expect(h.service.verify(null, code)).rejects.toMatchObject(genericError);
    h.advance(900_000); await expect(h.service.verify(a, code)).rejects.toMatchObject(genericError);
  });

  it('rolls back consumption if marking the user verified fails', async () => {
    const id = await user(); const h = clocked(); const { row, code } = await issue(h.service, id);
    const brokenUsers = { markEmailVerified: async () => { throw new Error('test write failure'); } } as any;
    const broken = clocked(new Date(), brokenUsers);
    await expect(broken.service.verify(id, code)).rejects.toThrow('test write failure');
    expect((await fixtures.query('SELECT "usedAt" FROM "EmailVerificationCode" WHERE id=$1', [row.id])).rows[0].usedAt).toBeNull();
    expect(await h.service.verify(id, code)).toBe(true);
  });

  it('leaves existing link tokens and the existing verify handler working', async () => {
    const id = await user(); const h = clocked(); await issue(h.service, id);
    const token = randomBytes(32).toString('base64url'); const tokenId = randomUUID();
    await fixtures.query(`INSERT INTO "Token" (id,"userId",purpose,"tokenHash","expiresAt") VALUES ($1,$2,'EMAIL_VERIFY',$3,now()+interval '24 hours')`, [tokenId, id, hashToken(token)]);
    h.advance(60_000); const open = await issue(h.service, id);
    const handler = new VerifyEmailHandler(transactions, { publish: vi.fn() } as any, users, new PrismaTokenRepository(), h.service);
    expect(await handler.execute(new VerifyEmailCommand(token))).toEqual({ verified: true });
    expect((await fixtures.query('SELECT "invalidatedAt" FROM "EmailVerificationCode" WHERE id=$1', [open.row.id])).rows[0].invalidatedAt).not.toBeNull();
    await expect(h.service.verify(id, open.code)).rejects.toMatchObject(genericError);
  });

  it('gives the mail worker only a live code: never superseded, used, expired, exhausted, rotated, unknown or already verified', async () => {
    const id = await user(); const h = clocked(); const old = await issue(h.service, id);
    expect(await h.service.codeForEmail(old.row.id)).toBe(old.code);
    h.advance(60_000); const next = await issue(h.service, id);
    expect(await h.service.codeForEmail(old.row.id)).toBeUndefined();
    expect(await h.service.codeForEmail(next.row.id)).toBe(next.code);
    const rotatedConfig = { env: { ...config.env, EMAIL_VERIFICATION_CODE_SECRET: randomBytes(32).toString('base64url') } } as AppConfigService;
    expect(await new EmailVerificationCodeService(rotatedConfig, transactions, repository, users).codeForEmail(next.row.id)).toBeUndefined();
    const disabledConfig = { env: { ...config.env, EMAIL_VERIFICATION_CODE_SECRET: undefined } } as AppConfigService;
    expect(await new EmailVerificationCodeService(disabledConfig, transactions, repository, users).codeForEmail(next.row.id)).toBeUndefined();
    h.advance(899_999); expect(await h.service.codeForEmail(next.row.id)).toBe(next.code);
    h.advance(1); expect(await h.service.codeForEmail(next.row.id)).toBeUndefined();

    const exhausted = await issue(h.service, id);
    for (let i = 0; i < 5; i++) await expect(h.service.verify(id, wrong(exhausted.code))).rejects.toMatchObject(genericError);
    expect(await h.service.codeForEmail(exhausted.row.id)).toBeUndefined();
    h.advance(60_000); const used = await issue(h.service, id);
    expect(await h.service.verify(id, used.code)).toBe(true);
    expect(await h.service.codeForEmail(used.row.id)).toBeUndefined();
    expect(await h.service.codeForEmail(randomUUID())).toBeUndefined();

    const linked = await user(); const fresh = clocked(); const open = await issue(fresh.service, linked);
    await fixtures.query('UPDATE "User" SET "emailVerifiedAt"=now() WHERE id=$1', [linked]);
    expect(await fresh.service.codeForEmail(open.row.id)).toBeUndefined();
  });

  it('rolls back the code and link token when the outbox write of a resend fails', async () => {
    const id = await user(); const { service } = clocked();
    const outbox = { publish: async () => { throw new Error('test outbox failure'); } };
    const handler = new RequestEmailVerificationHandler(transactions, outbox as any, new OneTimeTokenService(config), new LinkBuilder(config), config,
      users, new PrismaTokenRepository(), service);
    await expect(handler.execute(new RequestEmailVerificationCommand(id))).rejects.toThrow('test outbox failure');
    const counts = await fixtures.query(`SELECT (SELECT count(*)::int FROM "EmailVerificationCode" WHERE "userId"=$1) AS codes,
      (SELECT count(*)::int FROM "Token" WHERE "userId"=$1) AS tokens`, [id]);
    expect(counts.rows[0]).toEqual({ codes: 0, tokens: 0 });
    await issue(service, id); // A failed send consumes no cooldown.
  });
});

describe('public API and mail on the real Nest GraphQL schema', () => {
  it.each(['en', 'ar'])('registration atomically creates a challenge, link token and safe outbox payload (%s)', async lang => {
    const account = await register(lang);
    const rows = await fixtures.query(`SELECT c.id, c."codeHash", t."tokenHash", o.payload FROM "EmailVerificationCode" c
      JOIN "Token" t ON t."userId"=c."userId" AND t.purpose='EMAIL_VERIFY'
      JOIN "OutboxEvent" o ON o.payload->>'tokenId'=t.id::text WHERE c."userId"=$1`, [account.id]);
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0];
    expect(row.payload.codeChallengeId).toBe(row.id); expect(row.payload.lang).toBe(lang);
    expect(row.payload).not.toHaveProperty('code'); expect(row.payload).not.toHaveProperty('codeHash');
    expect(row.payload.verifyUrl).toContain('/verify-email?token=');
  });

  it('public resend shares registration cooldown, suppresses unknown email, and replaces the old code after 60 seconds', async () => {
    const account = await register();
    const initial = (await fixtures.query('SELECT * FROM "EmailVerificationCode" WHERE "userId"=$1', [account.id])).rows[0];
    const oldCode = deriveEmailVerificationCode(secret, account.id, initial.id);
    expect((await requestCode(account.email)).data?.requestEmailVerificationCode).toBe(true);
    expect((await requestCode('absent@api-code.invalid')).data?.requestEmailVerificationCode).toBe(true);
    expect((await fixtures.query('SELECT count(*)::int AS n FROM "EmailVerificationCode" WHERE "userId"=$1', [account.id])).rows[0].n).toBe(1);
    await fixtures.query(`UPDATE "EmailVerificationCode" SET "createdAt"="createdAt"-interval '61 seconds',"expiresAt"="expiresAt"-interval '61 seconds' WHERE id=$1`, [initial.id]);
    expect((await requestCode(account.email)).data?.requestEmailVerificationCode).toBe(true);
    const next = (await fixtures.query('SELECT * FROM "EmailVerificationCode" WHERE "userId"=$1 AND "invalidatedAt" IS NULL', [account.id])).rows[0];
    expect(next.id).not.toBe(initial.id);
    expect((await verifyCode(account.email, oldCode)).errors?.[0].extensions.code).toBe('INVALID_EMAIL_VERIFICATION_CODE');
    const code = deriveEmailVerificationCode(secret, account.id, next.id);
    expect((await verifyCode(account.email, code)).data?.verifyEmailCode).toBe(true);
    expect((await requestCode(account.email)).data?.requestEmailVerificationCode).toBe(true);
    expect((await verifyCode(account.email, code)).errors?.[0].extensions.code).toBe('INVALID_EMAIL_VERIFICATION_CODE');
  });

  it('authenticated resend shares the cooldown and the daily cap with registration and public resend', async () => {
    const account = await register();
    const login = await gql('mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { email: account.email, password: 'IntegrationOnly123!' } });
    expect(login.errors).toBeUndefined();
    const resend = () => gql('mutation{requestEmailVerification}', {}, login.data!.login.accessToken);
    const counts = async () => (await fixtures.query(`SELECT (SELECT count(*)::int FROM "EmailVerificationCode" WHERE "userId"=$1) AS codes,
      (SELECT count(*)::int FROM "OutboxEvent" WHERE payload->>'to'=$2) AS mails`, [account.id, account.email])).rows[0];
    const age = () => fixtures.query(`UPDATE "EmailVerificationCode" SET "createdAt"="createdAt"-interval '61 seconds',"expiresAt"="expiresAt"-interval '61 seconds' WHERE "userId"=$1`, [account.id]);
    expect((await resend()).data?.requestEmailVerification).toBe(true); // within registration cooldown
    expect(await counts()).toEqual({ codes: 1, mails: 1 });
    await age();
    expect((await resend()).data?.requestEmailVerification).toBe(true);
    expect(await counts()).toEqual({ codes: 2, mails: 2 });
    expect((await requestCode(account.email)).data?.requestEmailVerificationCode).toBe(true); // within authenticated-resend cooldown
    expect(await counts()).toEqual({ codes: 2, mails: 2 });
    await age();
    await fixtures.query(`INSERT INTO "EmailVerificationCode" (id,"userId","codeHash","createdAt","expiresAt","invalidatedAt")
      SELECT gen_random_uuid(),$1,repeat('0',64),now()-interval '1 hour',now()-interval '45 minutes',now()-interval '50 minutes' FROM generate_series(1,8)`, [account.id]);
    expect((await resend()).data?.requestEmailVerification).toBe(true);
    expect((await requestCode(account.email)).data?.requestEmailVerificationCode).toBe(true);
    expect(await counts()).toEqual({ codes: 10, mails: 2 });
  });

  it('unknown, wrong and expired verification cases have identical public errors', async () => {
    const account = await register();
    const row = (await fixtures.query('SELECT * FROM "EmailVerificationCode" WHERE "userId"=$1', [account.id])).rows[0];
    const code = deriveEmailVerificationCode(secret, account.id, row.id);
    const absent = await verifyCode('absent@api-code.invalid', '123456');
    const incorrect = await verifyCode(account.email, wrong(code));
    await fixtures.query(`UPDATE "EmailVerificationCode" SET "createdAt"=now()-interval '16 minutes',"expiresAt"=now()-interval '1 minute' WHERE id=$1`, [row.id]);
    const expired = await verifyCode(account.email, code);
    const error = (result: Awaited<ReturnType<typeof gql>>) => ({ message: result.errors?.[0].message, code: result.errors?.[0].extensions.code });
    expect(error(absent)).toEqual(genericError); expect(error(incorrect)).toEqual(genericError); expect(error(expired)).toEqual(genericError);
  });

  it('keeps disabled-feature registration link-only, accepts resend without sending, and rejects verify with the generic error', async () => {
    const saved = apiConfig.env.EMAIL_VERIFICATION_CODE_SECRET;
    apiConfig.env.EMAIL_VERIFICATION_CODE_SECRET = undefined;
    try {
      const account = await register();
      const outbox = (await fixtures.query('SELECT payload FROM "OutboxEvent" WHERE payload->>\'to\'=$1', [account.email])).rows[0].payload;
      expect(outbox.codeChallengeId).toBeUndefined(); expect(outbox.verifyUrl).toContain('token=');
      for (const email of [account.email, 'absent@api-code.invalid']) {
        expect((await requestCode(email)).data?.requestEmailVerificationCode).toBe(true);
      }
      expect((await fixtures.query(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE payload->>'to'=$1`, [account.email])).rows[0].n).toBe(1);
      expect((await verifyCode(account.email, '123456')).errors?.[0].extensions.code).toBe('INVALID_EMAIL_VERIFICATION_CODE');
    } finally { apiConfig.env.EMAIL_VERIFICATION_CODE_SECRET = saved; }
  });

  it('retains the actual auth IP throttle on both public mutations', async () => {
    const limit = Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);
    let resendThrottled = false; let verifyThrottled = false;
    for (let i = 0; i <= limit; i++) {
      resendThrottled ||= (await requestCode('absent@api-code.invalid')).errors?.[0].extensions.code === 'TOO_MANY_REQUESTS';
      verifyThrottled ||= (await verifyCode('absent@api-code.invalid', '123456')).errors?.[0].extensions.code === 'TOO_MANY_REQUESTS';
      if (resendThrottled && verifyThrottled) break;
    }
    expect(resendThrottled).toBe(true); expect(verifyThrottled).toBe(true);
  });
});
