-- Additive foundation only. The application supplies both timestamps and enforces the 15-minute lifetime.
CREATE TABLE "EmailVerificationCode" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "codeHash" text NOT NULL CHECK ("codeHash" ~ '^[0-9a-f]{64}$'),
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "failedAttempts" smallint NOT NULL DEFAULT 0 CHECK ("failedAttempts" BETWEEN 0 AND 5),
  "usedAt" timestamptz,
  "invalidatedAt" timestamptz,
  CHECK ("expiresAt" > "createdAt"),
  CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt"),
  CHECK ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt")
);
CREATE UNIQUE INDEX "EmailVerificationCode_one_open_per_user"
  ON "EmailVerificationCode" ("userId") WHERE "usedAt" IS NULL AND "invalidatedAt" IS NULL;
CREATE INDEX "EmailVerificationCode_user_created" ON "EmailVerificationCode" ("userId", "createdAt" DESC);
CREATE INDEX "EmailVerificationCode_expires" ON "EmailVerificationCode" ("expiresAt");
REVOKE ALL ON TABLE "EmailVerificationCode" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "EmailVerificationCode" TO kitchen_runtime;
