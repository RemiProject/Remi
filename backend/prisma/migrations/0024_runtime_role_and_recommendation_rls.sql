-- Phase 11: prepare a non-owner runtime role and isolate recommendations by household/user.
-- Login credentials are provisioned out of band; this group role never owns application tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitchen_runtime') THEN
    CREATE ROLE kitchen_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO kitchen_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kitchen_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kitchen_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kitchen_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kitchen_runtime;

ALTER TABLE "AIRecommendation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AIRecommendation_user_household_scope" ON "AIRecommendation"
  USING ("householdId"::text = NULLIF(current_setting('app.household_id', true), '')
    AND "userId"::text = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("householdId"::text = NULLIF(current_setting('app.household_id', true), '')
    AND "userId"::text = NULLIF(current_setting('app.user_id', true), ''));

ALTER TABLE "AIShoppingRecommendation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AIShoppingRecommendation_user_household_scope" ON "AIShoppingRecommendation"
  USING ("householdId"::text = NULLIF(current_setting('app.household_id', true), '') AND EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId" = "AIShoppingRecommendation"."householdId"
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')))
  WITH CHECK ("householdId"::text = NULLIF(current_setting('app.household_id', true), '') AND EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId" = "AIShoppingRecommendation"."householdId"
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')));

ALTER TABLE "AIRecommendationSafetyCheck" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AIRecommendationSafetyCheck_user_household_scope" ON "AIRecommendationSafetyCheck"
  USING (EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId"::text = NULLIF(current_setting('app.household_id', true), '')
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId"::text = NULLIF(current_setting('app.household_id', true), '')
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')));

-- Narrow discovery for the safety worker. It only returns a recommendation owner
-- when the caller already has the matching household context.
CREATE FUNCTION recommendation_safety_owner(p_id uuid, p_household uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT r."userId" FROM public."AIRecommendation" r
  WHERE r.id = p_id AND r."householdId" = p_household
    AND NULLIF(current_setting('app.household_id', true), '') = p_household::text
    AND r."userId" IS NOT NULL
$$;

CREATE FUNCTION recommendation_expire_batch(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  WITH due AS (
    SELECT id FROM public."AIRecommendation"
    WHERE status IN ('DRAFT', 'ACTIVE') AND "expiresAt" <= now()
    ORDER BY "expiresAt", id LIMIT LEAST(GREATEST(p_limit, 1), 500) FOR UPDATE SKIP LOCKED
  )
  UPDATE public."AIRecommendation" r SET status = 'EXPIRED', "statusChangedAt" = now()
  FROM due WHERE r.id = due.id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE FUNCTION recommendation_feedback_claim(p_limit integer)
RETURNS TABLE(id uuid, "userId" uuid, "foodId" uuid, "householdId" uuid, status public."RecommendationStatus")
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT r.id, r."userId", d."foodId", r."householdId", r.status
  FROM public."AIRecommendation" r
  JOIN public."AIShoppingRecommendation" d ON d."recommendationId" = r.id
  WHERE r.status IN ('ACCEPTED', 'DISMISSED') AND r."feedbackFoldedAt" IS NULL
  ORDER BY r."statusChangedAt", r.id
  LIMIT LEAST(GREATEST(p_limit, 1), 500)
  FOR UPDATE OF r SKIP LOCKED
$$;

REVOKE ALL ON FUNCTION recommendation_safety_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION recommendation_expire_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION recommendation_feedback_claim(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recommendation_safety_owner(uuid, uuid) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION recommendation_expire_batch(integer) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION recommendation_feedback_claim(integer) TO kitchen_runtime;

-- These trigger paths intentionally perform cross-row safety work; keep them under
-- their table-owner context so tenant policies do not make deferred checks partial.
ALTER FUNCTION recommendation_safety_guard() SECURITY DEFINER;
ALTER FUNCTION recommendation_safety_guard() SET search_path = pg_catalog, public;
ALTER FUNCTION ai_member_active_guard() SECURITY DEFINER;
ALTER FUNCTION ai_member_active_guard() SET search_path = pg_catalog, public;
ALTER FUNCTION member_joined_safety_reset() SECURITY DEFINER;
ALTER FUNCTION member_joined_safety_reset() SET search_path = pg_catalog, public;
ALTER FUNCTION safety_profile_change_statement() SECURITY DEFINER;
ALTER FUNCTION safety_profile_change_statement() SET search_path = pg_catalog, public;

-- Existing worker APIs need explicit grants to the non-login runtime group as well.
GRANT EXECUTE ON FUNCTION search_document_claim(text) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION search_document_complete(uuid, text, text, text, public.vector(384)) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION search_document_fail(uuid, text) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION notification_delivery_claim(integer) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION notification_delivery_sent(uuid) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION notification_delivery_failed(uuid, text, boolean) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION notification_device_unregistered(uuid, uuid) TO kitchen_runtime;
GRANT EXECUTE ON FUNCTION notification_expiry_generate(integer) TO kitchen_runtime;
