-- Phase 1 addition: Session (refresh-token rotation / revoke / logout-all)
-- Opaque refresh tokens only; raw value never stored. Access tokens remain short-lived JWTs.

CREATE TABLE "Session" (
  "id"                uuid PRIMARY KEY,
  "userId"            uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "familyId"          uuid NOT NULL,
  "refreshTokenHash"  text NOT NULL,
  "expiresAt"         timestamptz NOT NULL,
  "rotatedAt"         timestamptz,
  "revokedAt"         timestamptz,
  "lastUsedAt"        timestamptz,
  "userAgent"         text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Session_expires_after_created_ck" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "Session_refreshTokenHash_uq" UNIQUE ("refreshTokenHash")
);

CREATE INDEX "Session_user_active_ix"
  ON "Session" ("userId") WHERE "revokedAt" IS NULL;

CREATE INDEX "Session_familyId_ix"
  ON "Session" ("familyId");

CREATE INDEX "Session_expiresAt_ix"
  ON "Session" ("expiresAt");
