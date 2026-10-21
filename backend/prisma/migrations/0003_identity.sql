-- Phase 1: Identity & Households
CREATE TYPE "SystemRole"     AS ENUM ('USER', 'ADMIN');
CREATE TYPE "HouseholdRole"  AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "TokenPurpose"   AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'HOUSEHOLD_INVITATION');

CREATE TABLE "User" (
  "id"                  uuid PRIMARY KEY,
  "email"               text NOT NULL,
  "passwordHash"        text NOT NULL,
  "name"                text NOT NULL,
  "systemRole"          "SystemRole" NOT NULL DEFAULT 'USER',
  "countryId"           uuid NOT NULL REFERENCES "Country"("id")  ON DELETE RESTRICT,
  "localeId"            uuid NOT NULL REFERENCES "Locale"("id")   ON DELETE RESTRICT,
  "preferredLanguageId" uuid NOT NULL REFERENCES "Language"("id") ON DELETE RESTRICT,
  "timezone"            text NOT NULL,
  "emailVerifiedAt"     timestamptz,
  "lastLoginAt"         timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "deletedAt"           timestamptz,
  CONSTRAINT "User_email_lower_ck" CHECK ("email" = lower("email"))
);
CREATE UNIQUE INDEX "User_email_active_uq" ON "User" (lower("email")) WHERE "deletedAt" IS NULL;

CREATE TABLE "Household" (
  "id"        uuid PRIMARY KEY,
  "name"      text NOT NULL,
  "timezone"  text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);

CREATE TABLE "HouseholdMember" (
  "id"          uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "userId"      uuid NOT NULL REFERENCES "User"("id")      ON DELETE RESTRICT,
  "role"        "HouseholdRole" NOT NULL,
  "joinedAt"    timestamptz NOT NULL DEFAULT now(),
  "leftAt"      timestamptz,
  CONSTRAINT "HouseholdMember_household_user_uq" UNIQUE ("householdId", "userId"),
  CONSTRAINT "HouseholdMember_leftAt_ck" CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt")
);
CREATE UNIQUE INDEX "HouseholdMember_one_active_owner_uq"
  ON "HouseholdMember" ("householdId") WHERE "role" = 'OWNER' AND "leftAt" IS NULL;
CREATE INDEX "HouseholdMember_user_active_ix"
  ON "HouseholdMember" ("userId") WHERE "leftAt" IS NULL;

CREATE TABLE "Token" (
  "id"        uuid PRIMARY KEY,
  "userId"    uuid REFERENCES "User"("id") ON DELETE CASCADE,
  "purpose"   "TokenPurpose" NOT NULL,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "usedAt"    timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Token_expires_after_created_ck" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "Token_purpose_user_ck" CHECK (
    (("purpose" IN ('EMAIL_VERIFY', 'PASSWORD_RESET')) AND "userId" IS NOT NULL)
    OR ("purpose" = 'HOUSEHOLD_INVITATION' AND "userId" IS NULL)
  )
);
CREATE INDEX "Token_user_purpose_open_ix" ON "Token" ("userId", "purpose") WHERE "usedAt" IS NULL;
CREATE INDEX "Token_expiresAt_ix" ON "Token" ("expiresAt");

CREATE TABLE "HouseholdInvitation" (
  "id"              uuid PRIMARY KEY,
  "householdId"     uuid NOT NULL REFERENCES "Household"("id") ON DELETE CASCADE,
  "invitedByUserId" uuid NOT NULL,
  "email"           text NOT NULL,
  "tokenId"         uuid NOT NULL UNIQUE REFERENCES "Token"("id") ON DELETE RESTRICT,
  "role"            "HouseholdRole" NOT NULL,
  "acceptedAt"      timestamptz,
  "revokedAt"       timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HouseholdInvitation_inviter_fk" FOREIGN KEY ("householdId", "invitedByUserId")
    REFERENCES "HouseholdMember"("householdId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "HouseholdInvitation_email_lower_ck" CHECK ("email" = lower("email")),
  CONSTRAINT "HouseholdInvitation_role_ck" CHECK ("role" <> 'OWNER'),
  CONSTRAINT "HouseholdInvitation_state_ck" CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL)
);
CREATE UNIQUE INDEX "HouseholdInvitation_open_uq"
  ON "HouseholdInvitation" ("householdId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "HouseholdInvitation_household_ix" ON "HouseholdInvitation" ("householdId");
