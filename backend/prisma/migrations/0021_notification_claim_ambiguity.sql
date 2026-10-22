-- Qualify PL/pgSQL columns that share names with RETURNS TABLE output variables.
CREATE OR REPLACE FUNCTION notification_delivery_claim(p_limit integer DEFAULT 20)
RETURNS TABLE("id" uuid, "notificationId" uuid, "userId" uuid, "deviceId" uuid, "channel" text,
  "pushToken" text, "email" text, "language" text, "notificationType" text, "foodId" uuid, "inventoryItemId" uuid, "householdId" uuid, "attempts" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."NotificationDelivery" AS delivery SET status = 'FAILED', "failureCode" = 'token_unregistered'
    WHERE delivery.status = 'PENDING' AND delivery.channel = 'PUSH' AND EXISTS (
      SELECT 1 FROM public."UserDevice" d WHERE d.id = delivery."deviceId" AND d."revokedAt" IS NOT NULL
    );
  UPDATE public."NotificationDelivery" AS delivery SET
    status = CASE WHEN delivery.attempts >= 8 THEN 'FAILED'::public."NotificationDeliveryStatus" ELSE 'PENDING'::public."NotificationDeliveryStatus" END,
    "claimedAt" = NULL,
    "failureCode" = CASE WHEN delivery.attempts >= 8 THEN 'worker_lease_expired' ELSE delivery."failureCode" END,
    "nextAttemptAt" = CASE WHEN delivery.attempts >= 8 THEN delivery."nextAttemptAt" ELSE now() + interval '5 seconds' END
    WHERE delivery.status = 'PROCESSING' AND delivery."claimedAt" < now() - interval '5 minutes';
  UPDATE public."NotificationDelivery" AS delivery SET status = 'FAILED', "failureCode" = 'preference_disabled', "claimedAt" = NULL
  WHERE delivery.status = 'PENDING' AND EXISTS (
    SELECT 1 FROM public."NotificationPreference" p
    WHERE p."userId" = delivery."userId"
      AND p.type = (SELECT n.type FROM public."Notification" n WHERE n.id = delivery."notificationId")
      AND p.channel = delivery.channel AND NOT p."isEnabled"
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
