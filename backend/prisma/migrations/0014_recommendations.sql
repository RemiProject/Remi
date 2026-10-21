-- Phase 8: typed supply recommendations and fail-closed safety gate.
CREATE TYPE "RecommendationType" AS ENUM ('SUPPLY_NEED');
CREATE TYPE "RecommendationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ACCEPTED', 'DISMISSED', 'EXPIRED');
CREATE TYPE "SafetyStatus" AS ENUM ('PENDING', 'PASSED', 'BLOCKED');
CREATE TYPE "SafetyFilterType" AS ENUM ('ALLERGY_FOOD', 'ALLERGY_CATEGORY', 'HEALTH_AVOID', 'HEALTH_LIMIT', 'HEALTH_PREFER', 'DISLIKE_FOOD', 'DISLIKE_CATEGORY', 'DIETARY');
CREATE TYPE "SafetyCheckResult" AS ENUM ('PASSED', 'WARNED', 'FAILED');

CREATE TABLE "AIRecommendation" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "userId" uuid REFERENCES "User"("id") ON DELETE CASCADE,
  "type" "RecommendationType" NOT NULL,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'DRAFT',
  "safetyStatus" "SafetyStatus" NOT NULL DEFAULT 'PENDING',
  "summary" text,
  "modelVersion" text NOT NULL,
  "inputHash" text NOT NULL,
  "sourcePredictionId" uuid,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "statusChangedAt" timestamptz NOT NULL DEFAULT now(),
  "feedbackFoldedAt" timestamptz,
  CONSTRAINT "AIRecommendation_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "AIRecommendation_id_type_uq" UNIQUE ("id", "type"),
  CONSTRAINT "AIRecommendation_id_type_household_uq" UNIQUE ("id", "type", "householdId"),
  CONSTRAINT "AIRecommendation_household_user_fk" FOREIGN KEY ("householdId", "userId") REFERENCES "HouseholdMember"("householdId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "AIRecommendation_source_prediction_fk" FOREIGN KEY ("sourcePredictionId", "householdId") REFERENCES "AIPrediction"("id", "householdId") ON DELETE SET NULL ("sourcePredictionId"),
  CONSTRAINT "AIRecommendation_dates_ck" CHECK ("expiresAt" > "generatedAt"),
  CONSTRAINT "AIRecommendation_hash_ck" CHECK ("inputHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AIRecommendation_safe_active_ck" CHECK (status NOT IN ('ACTIVE', 'ACCEPTED') OR "safetyStatus" = 'PASSED'),
  CONSTRAINT "AIRecommendation_feedback_ck" CHECK ("feedbackFoldedAt" IS NULL OR status IN ('ACCEPTED', 'DISMISSED'))
);
CREATE UNIQUE INDEX "AIRecommendation_input_uq" ON "AIRecommendation" ("householdId", "type", "userId", "inputHash") NULLS NOT DISTINCT;
CREATE INDEX "AIRecommendation_visible_ix" ON "AIRecommendation" ("householdId", "status", "generatedAt" DESC) WHERE "safetyStatus" = 'PASSED';
CREATE INDEX "AIRecommendation_expiry_ix" ON "AIRecommendation" ("expiresAt");
CREATE INDEX "AIRecommendation_user_open_ix" ON "AIRecommendation" ("userId") WHERE status IN ('DRAFT', 'ACTIVE');
CREATE INDEX "AIRecommendation_feedback_ix" ON "AIRecommendation" ("statusChangedAt") WHERE status IN ('ACCEPTED', 'DISMISSED') AND "feedbackFoldedAt" IS NULL;

CREATE TABLE "AIShoppingRecommendation" (
  "recommendationId" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL,
  "recommendationType" "RecommendationType" NOT NULL DEFAULT 'SUPPLY_NEED' CHECK ("recommendationType" = 'SUPPLY_NEED'),
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "suggestedQty" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "priority" text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
  CONSTRAINT "AIShoppingRecommendation_parent_fk" FOREIGN KEY ("recommendationId", "recommendationType", "householdId") REFERENCES "AIRecommendation"("id", "type", "householdId") ON DELETE CASCADE,
  CONSTRAINT "AIShoppingRecommendation_qty_ck" CHECK ("suggestedQty" > 0)
);

CREATE TABLE "AIRecommendationSafetyCheck" (
  "id" uuid PRIMARY KEY,
  "recommendationId" uuid NOT NULL REFERENCES "AIRecommendation"("id") ON DELETE CASCADE,
  "filterType" "SafetyFilterType" NOT NULL,
  "result" "SafetyCheckResult" NOT NULL,
  "blockedFoodId" uuid REFERENCES "Food"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "AIRecommendationSafetyCheck_result_food_ck" CHECK (("result" = 'PASSED' AND "blockedFoodId" IS NULL) OR ("result" <> 'PASSED'))
);
CREATE UNIQUE INDEX "AIRecommendationSafetyCheck_pass_uq" ON "AIRecommendationSafetyCheck" ("recommendationId", "filterType") WHERE result = 'PASSED';
CREATE UNIQUE INDEX "AIRecommendationSafetyCheck_blocked_uq" ON "AIRecommendationSafetyCheck" ("recommendationId", "filterType", "blockedFoodId") WHERE "blockedFoodId" IS NOT NULL;

CREATE FUNCTION recommendation_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('ACCEPTED', 'DISMISSED', 'EXPIRED') THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW."safetyStatus" IS DISTINCT FROM OLD."safetyStatus"
       OR (NEW."feedbackFoldedAt" IS DISTINCT FROM OLD."feedbackFoldedAt" AND NOT (OLD."feedbackFoldedAt" IS NULL AND NEW."feedbackFoldedAt" IS NOT NULL)) THEN
      RAISE EXCEPTION 'recommendation_terminal: terminal recommendation cannot change' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN NEW."statusChangedAt" := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AIRecommendation_transition_guard" BEFORE UPDATE ON "AIRecommendation" FOR EACH ROW EXECUTE FUNCTION recommendation_transition_guard();

CREATE FUNCTION recommendation_safety_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; safe_state "SafetyStatus"; recommendation_state "RecommendationStatus";
BEGIN
  IF TG_TABLE_NAME = 'AIRecommendation' THEN rid := NEW.id;
  ELSE rid := COALESCE(NEW."recommendationId", OLD."recommendationId"); END IF;
  SELECT "safetyStatus", status INTO safe_state, recommendation_state FROM "AIRecommendation" WHERE id = rid;
  IF NOT FOUND OR recommendation_state IN ('ACCEPTED', 'DISMISSED', 'EXPIRED') THEN RETURN NULL; END IF;
  IF safe_state = 'PASSED' AND (
    EXISTS (SELECT 1 FROM unnest(enum_range(NULL::"SafetyFilterType")) f WHERE NOT EXISTS (
      SELECT 1 FROM "AIRecommendationSafetyCheck" c WHERE c."recommendationId" = rid AND c."filterType" = f))
    OR EXISTS (SELECT 1 FROM "AIRecommendationSafetyCheck" WHERE "recommendationId" = rid AND result = 'FAILED')
  ) THEN RAISE EXCEPTION 'safety_guard: recommendation % cannot be PASSED', rid USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "AIRecommendationSafetyCheck" p JOIN "AIRecommendationSafetyCheck" o
    ON o."recommendationId" = p."recommendationId" AND o."filterType" = p."filterType" AND o.id <> p.id
    WHERE p."recommendationId" = rid AND (p.result = 'PASSED' OR o.result = 'PASSED')) THEN
    RAISE EXCEPTION 'safety_guard: PASSED must be the only verdict row for its filter' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "AIRecommendation_safety_deferred" AFTER INSERT OR UPDATE OF "safetyStatus" ON "AIRecommendation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION recommendation_safety_guard();
CREATE CONSTRAINT TRIGGER "AIRecommendationSafetyCheck_safety_deferred" AFTER INSERT OR UPDATE OR DELETE ON "AIRecommendationSafetyCheck" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION recommendation_safety_guard();

CREATE FUNCTION ai_member_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hid uuid; uid uuid;
BEGIN
  IF TG_TABLE_NAME = 'HouseholdMember' THEN hid := OLD."householdId"; uid := OLD."userId";
  ELSE hid := NEW."householdId"; uid := NEW."userId"; END IF;
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME <> 'HouseholdMember' AND NOT EXISTS (SELECT 1 FROM "HouseholdMember" WHERE "householdId" = hid AND "userId" = uid AND "leftAt" IS NULL) THEN
    RAISE EXCEPTION 'ai_member_active_guard: recommendation requires active member' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'HouseholdMember' AND OLD."leftAt" IS NULL AND NEW."leftAt" IS NOT NULL THEN
    UPDATE "AIRecommendation" SET status = 'EXPIRED', "safetyStatus" = 'BLOCKED', "statusChangedAt" = now()
    WHERE "householdId" = hid AND "userId" = uid AND status IN ('DRAFT', 'ACTIVE');
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "AIRecommendation_member_active" AFTER INSERT OR UPDATE ON "AIRecommendation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ai_member_active_guard();
CREATE CONSTRAINT TRIGGER "HouseholdMember_recommendation_leave" AFTER UPDATE OF "leftAt" ON "HouseholdMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ai_member_active_guard();

-- Profile changes invalidate all open recommendations in the same transaction.
CREATE OR REPLACE FUNCTION safety_profile_change_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE relation_name text; entry jsonb; user_id uuid; entity_id uuid; entity_type "SafetyEntityType"; event_action "SafetyEventAction";
BEGIN
  entity_type := CASE TG_TABLE_NAME WHEN 'UserAllergy' THEN 'ALLERGY_FOOD' WHEN 'UserAllergyCategory' THEN 'ALLERGY_CATEGORY'
    WHEN 'UserHealthCondition' THEN 'HEALTH_CONDITION' WHEN 'UserDietaryPreference' THEN 'DIETARY_PREFERENCE'
    WHEN 'UserDislikedFood' THEN 'DISLIKE_FOOD' WHEN 'UserDislikedCategory' THEN 'DISLIKE_CATEGORY' END;
  IF TG_OP = 'INSERT' THEN relation_name := TG_ARGV[0]; event_action := 'CREATED';
  ELSIF TG_OP = 'DELETE' THEN relation_name := TG_ARGV[0]; event_action := 'DELETED';
  ELSE relation_name := TG_ARGV[0]; event_action := 'UPDATED'; END IF;
  FOR entry IN EXECUTE format('SELECT to_jsonb(x) FROM %I x', relation_name) LOOP
    user_id := (entry->>'userId')::uuid; entity_id := (entry->>'id')::uuid;
    PERFORM safety_lock(ARRAY[user_id]);
    IF to_regclass('"AIRecommendation"') IS NOT NULL THEN
      UPDATE "AIRecommendation" SET status = 'DRAFT', "safetyStatus" = 'PENDING', "statusChangedAt" = now()
      WHERE "userId" = user_id AND status IN ('DRAFT', 'ACTIVE');
    END IF;
    INSERT INTO "UserSafetyProfileEvent" ("id", "userId", "actorUserId", "entityType", "entityId", "action", "snapshot")
    VALUES (gen_random_uuid(), user_id, user_id, entity_type, entity_id, event_action, entry - 'notes' - 'createdAt' - 'updatedAt');
    INSERT INTO "OutboxEvent" ("topic", "dedupeKey", "payload") VALUES ('safety.profile.changed', user_id::text || ':' || txid_current()::text, jsonb_build_object('userId', user_id))
    ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION member_joined_safety_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."leftAt" IS NOT NULL AND NEW."leftAt" IS NULL THEN
    PERFORM safety_lock(ARRAY[NEW."userId"]);
    UPDATE "AIRecommendation" SET status = 'DRAFT', "safetyStatus" = 'PENDING', "statusChangedAt" = now()
    WHERE "householdId" = NEW."householdId" AND status IN ('DRAFT', 'ACTIVE');
    INSERT INTO "OutboxEvent" ("householdId", "topic", "dedupeKey", "payload") VALUES
      (NEW."householdId", 'safety.profile.changed', NEW."userId"::text || ':' || txid_current()::text, jsonb_build_object('userId', NEW."userId"))
      ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HouseholdMember_safety_reset" AFTER UPDATE OF "leftAt" ON "HouseholdMember" FOR EACH ROW EXECUTE FUNCTION member_joined_safety_reset();
