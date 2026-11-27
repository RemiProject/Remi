-- Additive only. One row per password reset email. The application supplies both timestamps and enforces the limits.
-- codeHash NULL marks a link-only email (no code secret configured): it counts toward the cooldown and daily cap,
-- and can never be verified.
CREATE TABLE "PasswordResetCode" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "codeHash" text CHECK ("codeHash" IS NULL OR "codeHash" ~ '^[0-9a-f]{64}$'),
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "failedAttempts" smallint NOT NULL DEFAULT 0 CHECK ("failedAttempts" BETWEEN 0 AND 5),
  "usedAt" timestamptz,
  "invalidatedAt" timestamptz,
  CHECK ("expiresAt" > "createdAt"),
  CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt"),
  CHECK ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt"),
  CHECK ("codeHash" IS NOT NULL OR ("failedAttempts" = 0 AND "usedAt" IS NULL))
);
CREATE UNIQUE INDEX "PasswordResetCode_one_open_per_user"
  ON "PasswordResetCode" ("userId") WHERE "codeHash" IS NOT NULL AND "usedAt" IS NULL AND "invalidatedAt" IS NULL;
CREATE INDEX "PasswordResetCode_user_created" ON "PasswordResetCode" ("userId", "createdAt" DESC);
CREATE INDEX "PasswordResetCode_expires" ON "PasswordResetCode" ("expiresAt");
REVOKE ALL ON TABLE "PasswordResetCode" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PasswordResetCode" TO kitchen_runtime;
