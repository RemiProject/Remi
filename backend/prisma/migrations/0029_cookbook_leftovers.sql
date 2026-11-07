CREATE TABLE "CookbookLeftover" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE CASCADE,
  "createdByUserId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "name" text NOT NULL CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  "portions" integer NOT NULL CHECK ("portions" BETWEEN 1 AND 100),
  "cookedOn" date NOT NULL,
  "useBy" date,
  "storage" text NOT NULL CHECK ("storage" IN ('FRIDGE', 'FREEZER')),
  "status" text NOT NULL DEFAULT 'STORED' CHECK ("status" IN ('STORED', 'EATEN', 'DISCARDED')),
  "notes" text NOT NULL DEFAULT '' CHECK (length("notes") <= 1000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("useBy" IS NULL OR "useBy" >= "cookedOn")
);
CREATE INDEX "CookbookLeftover_household_ix" ON "CookbookLeftover" ("householdId", "cookedOn" DESC);
ALTER TABLE "CookbookLeftover" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CookbookLeftover" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CookbookLeftover_household_only" ON "CookbookLeftover"
  USING ("householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
GRANT SELECT, INSERT, UPDATE ON "CookbookLeftover" TO kitchen_runtime;

CREATE TABLE "CookbookFeedback" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "subject" text NOT NULL CHECK (length(btrim("subject")) BETWEEN 1 AND 120),
  "message" text NOT NULL CHECK (length(btrim("message")) BETWEEN 1 AND 5000),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "CookbookFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CookbookFeedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CookbookFeedback_owner_only" ON "CookbookFeedback"
  USING ("userId"::text = current_setting('app.user_id', true) AND "householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("userId"::text = current_setting('app.user_id', true) AND "householdId"::text = current_setting('app.household_id', true));
GRANT SELECT, INSERT ON "CookbookFeedback" TO kitchen_runtime;
