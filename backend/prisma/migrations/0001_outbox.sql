-- Phase 0: OutboxEvent (infrastructure table, no FKs on purpose)
CREATE TABLE "OutboxEvent" (
  "id"            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "householdId"   uuid,
  "topic"         text        NOT NULL,
  "dedupeKey"     text        NOT NULL,
  "payload"       jsonb       NOT NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "processedAt"   timestamptz,
  "attempts"      integer     NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "lastError"     text,
  "deadLetteredAt" timestamptz
);

CREATE UNIQUE INDEX "OutboxEvent_topic_dedupeKey_open_uq"
  ON "OutboxEvent" ("topic", "dedupeKey")
  WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL;

CREATE INDEX "OutboxEvent_ready_ix"
  ON "OutboxEvent" ("nextAttemptAt", "id")
  WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL;
