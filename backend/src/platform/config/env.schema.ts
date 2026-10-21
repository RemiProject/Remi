import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const optionalString = z.string().optional().transform((v) => (v === '' ? undefined : v));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.string().default('info'),
    APP_BASE_URL: z.string().default('http://localhost:3000'),
    WEB_BASE_URL: z.string().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    DATABASE_URL: z.string().min(1),
    DATABASE_URL_MIGRATOR: optionalString,
    DATABASE_URL_TEST: optionalString,
    PROFILE_NOTES_KEYRING: optionalString,
    FRESHNESS_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
    EMBEDDING_API_URL: optionalString,
    EMBEDDING_API_KEY: optionalString,
    EMBEDDING_MODEL: optionalString,
    EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().positive().default(24),
    PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(30),
    INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    EMAIL_VERIFICATION_REQUIRED: bool.default(false),

    ENABLE_OUTBOX_POLLER: bool.default(true),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(10),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),

    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: optionalString,
    S3_PUBLIC_ENDPOINT: optionalString,
    S3_FORCE_PATH_STYLE: bool.default(false),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_AUTO_CREATE_BUCKET: bool.default(false),
    IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    IMAGE_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(300),
    IMAGE_ALLOWED_MIME: z.string().default('image/jpeg,image/png,image/webp,image/heic'),

    MAIL_FROM: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_TEMPLATES_DIR: optionalString,

    GRAPHQL_DEPTH_LIMIT: z.coerce.number().int().positive().default(7),
    GRAPHQL_INTROSPECTION: bool.default(true),
    THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
    THROTTLE_UPLOAD_LIMIT: z.coerce.number().int().positive().default(20),
  })
  .refine((e) => !e.SMTP_HOST || !!e.MAIL_FROM, { message: 'MAIL_FROM is required when SMTP_HOST is set', path: ['MAIL_FROM'] });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
