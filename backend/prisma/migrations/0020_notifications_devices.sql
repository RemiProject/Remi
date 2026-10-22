-- Phase 10: user-owned devices, preferences, inbox notifications, and delivery queue.
CREATE TYPE "UserDevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');
CREATE TYPE "NotificationType" AS ENUM ('EXPIRY_SOON', 'LOW_STOCK', 'RECOMMENDATION_READY', 'SAFETY_REVIEW', 'PURCHASE_RECEIVED', 'MEMBER_CHANGED');
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "UserDevice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "platform" "UserDevicePlatform" NOT NULL,
  "pushToken" text NOT NULL UNIQUE,
  "appVersion" text,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserDevice_id_user_uq" UNIQUE ("id", "userId"),
  CONSTRAINT "UserDevice_token_ck" CHECK (length(btrim("pushToken")) BETWEEN 16 AND 4096)
);
CREATE INDEX "UserDevice_active_user_ix" ON "UserDevice" ("userId") WHERE "revokedAt" IS NULL;

CREATE TABLE "NotificationPreference" (
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "quietHoursStart" time,
  "quietHoursEnd" time,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "type", "channel"),
  CONSTRAINT "NotificationPreference_quiet_hours_ck" CHECK (
    ("quietHoursStart" IS NULL AND "quietHoursEnd" IS NULL) OR
    ("quietHoursStart" IS NOT NULL AND "quietHoursEnd" IS NOT NULL AND "quietHoursStart" <> "quietHoursEnd")
  )
);

CREATE TABLE "Notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "householdId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "type" "NotificationType" NOT NULL,
  "foodId" uuid,
  "inventoryItemId" uuid,
  "dedupeKey" text NOT NULL,
  "scheduledFor" timestamptz NOT NULL DEFAULT now(),
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Notification_id_user_uq" UNIQUE ("id", "userId"),
  CONSTRAINT "Notification_user_dedupe_uq" UNIQUE ("userId", "dedupeKey"),
  CONSTRAINT "Notification_member_fk" FOREIGN KEY ("householdId", "userId") REFERENCES "HouseholdMember"("householdId", "userId") ON DELETE CASCADE,
  CONSTRAINT "Notification_food_fk" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT,
  CONSTRAINT "Notification_inventory_fk" FOREIGN KEY ("inventoryItemId", "householdId") REFERENCES "InventoryItem"("id", "householdId") ON DELETE SET NULL ("inventoryItemId"),
  CONSTRAINT "Notification_type_reference_ck" CHECK (
    ("type" IN ('EXPIRY_SOON', 'LOW_STOCK') AND "foodId" IS NOT NULL) OR
    ("type" NOT IN ('EXPIRY_SOON', 'LOW_STOCK') AND "foodId" IS NULL AND "inventoryItemId" IS NULL) OR
    ("type" IN ('EXPIRY_SOON', 'LOW_STOCK') AND "foodId" IS NOT NULL AND "inventoryItemId" IS NOT NULL)
  ),
  CONSTRAINT "Notification_dedupe_ck" CHECK (length(btrim("dedupeKey")) BETWEEN 1 AND 300)
);
CREATE INDEX "Notification_inbox_ix" ON "Notification" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "Notification_unread_ix" ON "Notification" ("userId") WHERE "readAt" IS NULL;

CREATE TABLE "NotificationDelivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notificationId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "deviceId" uuid,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" smallint NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "claimedAt" timestamptz,
  "failureCode" text,
  "sentAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NotificationDelivery_notification_user_fk" FOREIGN KEY ("notificationId", "userId") REFERENCES "Notification"("id", "userId") ON DELETE CASCADE,
  CONSTRAINT "NotificationDelivery_device_user_fk" FOREIGN KEY ("deviceId", "userId") REFERENCES "UserDevice"("id", "userId") ON DELETE CASCADE,
  CONSTRAINT "NotificationDelivery_unique" UNIQUE NULLS NOT DISTINCT ("notificationId", "channel", "deviceId"),
  CONSTRAINT "NotificationDelivery_channel_device_ck" CHECK (("channel" = 'PUSH') = ("deviceId" IS NOT NULL)),
  CONSTRAINT "NotificationDelivery_sent_ck" CHECK ("status" <> 'SENT' OR "sentAt" IS NOT NULL),
  CONSTRAINT "NotificationDelivery_attempts_ck" CHECK ("attempts" BETWEEN 0 AND 8)
);
CREATE INDEX "NotificationDelivery_pending_ix" ON "NotificationDelivery" ("nextAttemptAt", "createdAt") WHERE "status" = 'PENDING';

ALTER TABLE "UserDevice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "UserDevice_owner_only" ON "UserDevice" USING ("userId"::text = current_setting('app.user_id', true)) WITH CHECK ("userId"::text = current_setting('app.user_id', true));
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NotificationPreference_owner_only" ON "NotificationPreference" USING ("userId"::text = current_setting('app.user_id', true)) WITH CHECK ("userId"::text = current_setting('app.user_id', true));
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notification_owner_only" ON "Notification" USING ("userId"::text = current_setting('app.user_id', true)) WITH CHECK ("userId"::text = current_setting('app.user_id', true));
ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NotificationDelivery_owner_only" ON "NotificationDelivery" USING ("userId"::text = current_setting('app.user_id', true)) WITH CHECK ("userId"::text = current_setting('app.user_id', true));

CREATE FUNCTION notification_member_active_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."HouseholdMember" WHERE "householdId" = NEW."householdId" AND "userId" = NEW."userId" AND "leftAt" IS NULL) THEN
    RAISE EXCEPTION 'notification_member_inactive' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Notification_member_active_guard" BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_member_active_guard();

-- PostgreSQL dispatches this only after the transaction commits. The event contains IDs only.
CREATE FUNCTION notification_publish_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_notify('notification_received', json_build_object('userId', NEW."userId", 'notificationId', NEW."id", 'householdId', NEW."householdId")::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Notification_publish_insert" AFTER INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_publish_insert();

-- Claim a small batch globally under SECURITY DEFINER; provider I/O happens after this function returns.
CREATE FUNCTION notification_delivery_claim(p_limit integer DEFAULT 20)
RETURNS TABLE("id" uuid, "notificationId" uuid, "userId" uuid, "deviceId" uuid, "channel" text,
  "pushToken" text, "email" text, "language" text, "notificationType" text, "foodId" uuid, "inventoryItemId" uuid, "householdId" uuid, "attempts" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."NotificationDelivery" SET status = 'FAILED', "failureCode" = 'token_unregistered'
    WHERE status = 'PENDING' AND channel = 'PUSH' AND EXISTS (
      SELECT 1 FROM public."UserDevice" d WHERE d.id = "NotificationDelivery"."deviceId" AND d."revokedAt" IS NOT NULL
    );
  UPDATE public."NotificationDelivery" SET
    status = CASE WHEN attempts >= 8 THEN 'FAILED'::public."NotificationDeliveryStatus" ELSE 'PENDING'::public."NotificationDeliveryStatus" END,
    "claimedAt" = NULL,
    "failureCode" = CASE WHEN attempts >= 8 THEN 'worker_lease_expired' ELSE "failureCode" END,
    "nextAttemptAt" = CASE WHEN attempts >= 8 THEN "nextAttemptAt" ELSE now() + interval '5 seconds' END
    WHERE status = 'PROCESSING' AND "claimedAt" < now() - interval '5 minutes';
  UPDATE public."NotificationDelivery" d SET status = 'FAILED', "failureCode" = 'preference_disabled', "claimedAt" = NULL
  WHERE d.status = 'PENDING' AND EXISTS (
    SELECT 1 FROM public."NotificationPreference" p WHERE p."userId" = d."userId" AND p.type = (SELECT n.type FROM public."Notification" n WHERE n.id = d."notificationId") AND p.channel = d.channel AND NOT p."isEnabled"
  );
  RETURN QUERY
  WITH picked AS (
    SELECT d.id FROM public."NotificationDelivery" d
    JOIN public."Notification" n ON n.id = d."notificationId"
    JOIN public."User" u ON u.id = d."userId"
    LEFT JOIN public."UserDevice" dev ON dev.id = d."deviceId" AND dev."userId" = d."userId"
    LEFT JOIN public."NotificationPreference" pref ON pref."userId" = d."userId" AND pref.type = n.type AND pref.channel = d.channel
    WHERE d.status = 'PENDING' AND d."nextAttemptAt" <= now()
      AND (d.channel <> 'PUSH' OR dev."revokedAt" IS NULL)
      AND NOT (pref."quietHoursStart" IS NOT NULL AND
        CASE WHEN pref."quietHoursStart" < pref."quietHoursEnd"
          THEN timezone(u.timezone, now())::time >= pref."quietHoursStart" AND timezone(u.timezone, now())::time < pref."quietHoursEnd"
          ELSE timezone(u.timezone, now())::time >= pref."quietHoursStart" OR timezone(u.timezone, now())::time < pref."quietHoursEnd" END)
    ORDER BY d."nextAttemptAt", d."createdAt", d.id LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public."NotificationDelivery" d SET status = 'PROCESSING', "claimedAt" = now(), attempts = d.attempts + 1
    FROM picked WHERE d.id = picked.id
    RETURNING d.id, d."notificationId", d."userId", d."deviceId", d.channel::text, d.attempts
  )
  SELECT c.id, c."notificationId", c."userId", c."deviceId", c.channel,
    dev."pushToken", u.email, COALESCE(l.code, 'en'), n.type::text, n."foodId", n."inventoryItemId", n."householdId", c.attempts::integer
  FROM claimed c JOIN public."Notification" n ON n.id = c."notificationId"
  JOIN public."User" u ON u.id = c."userId"
  LEFT JOIN public."UserDevice" dev ON dev.id = c."deviceId"
  LEFT JOIN public."Language" l ON l.id = u."preferredLanguageId";
END;
$$;

CREATE OR REPLACE FUNCTION notification_expiry_generate(p_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE created_count integer;
BEGIN
  WITH candidates AS (
    SELECT i."householdId", m."userId", f.id AS "foodId", i.id AS "inventoryItemId",
      'expiry:' || i.id::text || ':' || extract(epoch FROM i."estimatedExpiryAt")::bigint::text AS dedupe_key
    FROM public."InventoryItem" i
    JOIN public."Food" f ON f.id = i."foodId" AND f."archivedAt" IS NULL
    JOIN public."HouseholdMember" m ON m."householdId" = i."householdId" AND m."leftAt" IS NULL
    WHERE i."archivedAt" IS NULL AND i.quantity > 0
      AND i."estimatedExpiryAt" > now() AND i."estimatedExpiryAt" <= now() + interval '3 days'
    ORDER BY i."estimatedExpiryAt", i.id, m."userId" LIMIT GREATEST(1, LEAST(p_limit, 500))
  ), inserted AS (
    INSERT INTO public."Notification" ("householdId", "userId", type, "foodId", "inventoryItemId", "dedupeKey", "scheduledFor")
    SELECT c."householdId", c."userId", 'EXPIRY_SOON', c."foodId", c."inventoryItemId", c.dedupe_key, now() FROM candidates c
    ON CONFLICT ("userId", "dedupeKey") DO NOTHING RETURNING id, "userId", type
  ), push_rows AS (
    INSERT INTO public."NotificationDelivery" ("notificationId", "userId", "deviceId", channel)
    SELECT n.id, n."userId", d.id, 'PUSH' FROM inserted n
    JOIN public."UserDevice" d ON d."userId" = n."userId" AND d."revokedAt" IS NULL
    LEFT JOIN public."NotificationPreference" p ON p."userId" = n."userId" AND p.type = n.type AND p.channel = 'PUSH'
    WHERE COALESCE(p."isEnabled", true) ON CONFLICT DO NOTHING RETURNING id
  ), email_rows AS (
    INSERT INTO public."NotificationDelivery" ("notificationId", "userId", channel)
    SELECT n.id, n."userId", 'EMAIL' FROM inserted n
    JOIN public."NotificationPreference" p ON p."userId" = n."userId" AND p.type = n.type AND p.channel = 'EMAIL' AND p."isEnabled"
    ON CONFLICT DO NOTHING RETURNING id
  ) SELECT count(*) INTO created_count FROM inserted;
  RETURN created_count;
END;
$$;

CREATE FUNCTION notification_delivery_sent(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public."NotificationDelivery" SET status = 'SENT', "sentAt" = now(), "claimedAt" = NULL, "failureCode" = NULL WHERE id = p_id AND status = 'PROCESSING';
$$;
CREATE FUNCTION notification_delivery_failed(p_id uuid, p_code text, p_permanent boolean DEFAULT false) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public."NotificationDelivery" SET
    status = CASE WHEN p_permanent OR attempts >= 8 THEN 'FAILED'::public."NotificationDeliveryStatus" ELSE 'PENDING'::public."NotificationDeliveryStatus" END,
    "failureCode" = left(regexp_replace(p_code, '[^a-zA-Z0-9_.-]', '_', 'g'), 80), "claimedAt" = NULL,
    "nextAttemptAt" = CASE WHEN p_permanent OR attempts >= 8 THEN "nextAttemptAt" ELSE now() + (LEAST(3600, 5 * power(2, GREATEST(attempts - 1, 0))) * interval '1 second') END
  WHERE id = p_id AND status = 'PROCESSING';
$$;
CREATE FUNCTION notification_device_unregistered(p_id uuid, p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_id uuid;
BEGIN
  SELECT "userId" INTO owner_id FROM public."UserDevice" WHERE id = p_device;
  IF owner_id IS NOT NULL THEN UPDATE public."UserDevice" SET "revokedAt" = COALESCE("revokedAt", now()) WHERE id = p_device; END IF;
  UPDATE public."NotificationDelivery" SET status = 'FAILED', "failureCode" = 'token_unregistered', "claimedAt" = NULL WHERE id = p_id AND status = 'PROCESSING';
END;
$$;

REVOKE ALL ON FUNCTION notification_member_active_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_publish_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_delivery_claim(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_delivery_sent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_delivery_failed(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_device_unregistered(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_expiry_generate(integer) FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION notification_delivery_claim(integer) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION notification_delivery_sent(uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION notification_delivery_failed(uuid, text, boolean) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION notification_device_unregistered(uuid, uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION notification_expiry_generate(integer) TO %I', current_user);
END;
$$;
