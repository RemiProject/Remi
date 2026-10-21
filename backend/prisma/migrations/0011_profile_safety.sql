-- Phase 6: personal profile, preferences, health conditions and safety history.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');
CREATE TYPE "GoalType" AS ENUM ('LOSE_WEIGHT', 'GAIN_MUSCLE', 'MAINTAIN', 'CUSTOM');
CREATE TYPE "DietaryPreference" AS ENUM ('VEGETARIAN', 'VEGAN', 'HALAL', 'GLUTEN_FREE', 'DAIRY_FREE', 'KETO', 'LOW_CARB');
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');
CREATE TYPE "ConditionStatus" AS ENUM ('ACTIVE', 'CONTROLLED', 'REMISSION', 'RESOLVED');
CREATE TYPE "HealthConditionGroup" AS ENUM ('METABOLIC', 'CARDIOVASCULAR', 'RENAL', 'DIGESTIVE', 'AUTOIMMUNE', 'OTHER');
CREATE TYPE "DietRuleType" AS ENUM ('AVOID', 'LIMIT', 'PREFER');
CREATE TYPE "DietRuleTarget" AS ENUM ('FOOD', 'CATEGORY', 'NUTRIENT');
CREATE TYPE "NutrientKey" AS ENUM ('CALORIES', 'PROTEIN', 'CARBS', 'FAT', 'FIBER', 'SUGAR', 'SODIUM');
CREATE TYPE "SafetyEntityType" AS ENUM ('ALLERGY_FOOD', 'ALLERGY_CATEGORY', 'HEALTH_CONDITION', 'DIETARY_PREFERENCE', 'DISLIKE_FOOD', 'DISLIKE_CATEGORY');
CREATE TYPE "SafetyEventAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

CREATE TABLE "UserProfile" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "heightCm" numeric(5,1),
  "weightKg" numeric(5,2),
  "birthDate" date,
  "gender" "Gender",
  "activityLevel" "ActivityLevel",
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserProfile_height_ck" CHECK ("heightCm" IS NULL OR "heightCm" BETWEEN 50 AND 260),
  CONSTRAINT "UserProfile_weight_ck" CHECK ("weightKg" IS NULL OR "weightKg" BETWEEN 10 AND 500),
  CONSTRAINT "UserProfile_birth_date_ck" CHECK ("birthDate" IS NULL OR "birthDate" <= CURRENT_DATE)
);

CREATE TABLE "UserGoal" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "goalType" "GoalType" NOT NULL,
  "targetWeightKg" numeric(5,2),
  "calorieTarget" integer,
  "proteinTargetG" integer,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  CONSTRAINT "UserGoal_weight_ck" CHECK ("targetWeightKg" IS NULL OR "targetWeightKg" BETWEEN 10 AND 500),
  CONSTRAINT "UserGoal_calories_ck" CHECK ("calorieTarget" IS NULL OR "calorieTarget" BETWEEN 500 AND 20000),
  CONSTRAINT "UserGoal_protein_ck" CHECK ("proteinTargetG" IS NULL OR "proteinTargetG" BETWEEN 1 AND 1000),
  CONSTRAINT "UserGoal_dates_ck" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE UNIQUE INDEX "UserGoal_active_uq" ON "UserGoal" ("userId") WHERE "endedAt" IS NULL;
CREATE INDEX "UserGoal_history_ix" ON "UserGoal" ("userId", "startedAt" DESC);

CREATE TABLE "UserWeightLog" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "weightKg" numeric(5,2) NOT NULL,
  "measuredAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserWeightLog_weight_ck" CHECK ("weightKg" BETWEEN 10 AND 500),
  CONSTRAINT "UserWeightLog_user_measured_uq" UNIQUE ("userId", "measuredAt")
);
CREATE INDEX "UserWeightLog_history_ix" ON "UserWeightLog" ("userId", "measuredAt" DESC);

CREATE TABLE "UserPreference" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "preferredDifficulty" "RecipeDifficulty",
  "maxPrepTimeMin" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserPreference_prep_time_ck" CHECK ("maxPrepTimeMin" IS NULL OR "maxPrepTimeMin" BETWEEN 1 AND 1440)
);

CREATE TABLE "UserDietaryPreference" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "dietaryPreference" "DietaryPreference" NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserDietaryPreference_user_diet_uq" UNIQUE ("userId", "dietaryPreference")
);

CREATE TABLE "UserPreferredCuisine" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "cuisineId" uuid NOT NULL REFERENCES "Cuisine"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserPreferredCuisine_user_cuisine_uq" UNIQUE ("userId", "cuisineId")
);

CREATE TABLE "UserDislikedFood" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserDislikedFood_user_food_uq" UNIQUE ("userId", "foodId")
);

CREATE TABLE "UserDislikedCategory" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "categoryId" uuid NOT NULL REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserDislikedCategory_user_category_uq" UNIQUE ("userId", "categoryId")
);

CREATE TABLE "UserAllergy" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "severity" "AllergySeverity" NOT NULL,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserAllergy_user_food_uq" UNIQUE ("userId", "foodId"),
  CONSTRAINT "UserAllergy_notes_is_encrypted" CHECK ("notes" IS NULL OR "notes" LIKE 'enc:v1:%')
);

CREATE TABLE "UserAllergyCategory" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "categoryId" uuid NOT NULL REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "severity" "AllergySeverity" NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserAllergyCategory_user_category_uq" UNIQUE ("userId", "categoryId")
);

CREATE TABLE "HealthCondition" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "conditionGroup" "HealthConditionGroup" NOT NULL,
  "isChronic" boolean NOT NULL DEFAULT false,
  "archivedAt" timestamptz,
  CONSTRAINT "HealthCondition_code_ck" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "HealthCondition_name_ck" CHECK (length(btrim("name")) BETWEEN 1 AND 200)
);

CREATE TABLE "UserHealthCondition" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "healthConditionId" uuid NOT NULL REFERENCES "HealthCondition"("id") ON DELETE RESTRICT,
  "status" "ConditionStatus" NOT NULL DEFAULT 'ACTIVE',
  "diagnosedAt" date,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserHealthCondition_user_condition_uq" UNIQUE ("userId", "healthConditionId"),
  CONSTRAINT "UserHealthCondition_notes_is_encrypted" CHECK ("notes" IS NULL OR "notes" LIKE 'enc:v1:%')
);

CREATE TABLE "HealthConditionDietRule" (
  "id" uuid PRIMARY KEY,
  "healthConditionId" uuid NOT NULL REFERENCES "HealthCondition"("id") ON DELETE CASCADE,
  "ruleType" "DietRuleType" NOT NULL,
  "targetType" "DietRuleTarget" NOT NULL,
  "foodId" uuid REFERENCES "Food"("id") ON DELETE RESTRICT,
  "categoryId" uuid REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "nutrient" "NutrientKey",
  "maxPer100g" numeric(8,2),
  "maxPerDay" numeric(10,2),
  "isActive" boolean NOT NULL DEFAULT true,
  CONSTRAINT "HealthConditionDietRule_target_ck" CHECK (
    ("targetType" = 'FOOD' AND "foodId" IS NOT NULL AND "categoryId" IS NULL AND "nutrient" IS NULL) OR
    ("targetType" = 'CATEGORY' AND "foodId" IS NULL AND "categoryId" IS NOT NULL AND "nutrient" IS NULL) OR
    ("targetType" = 'NUTRIENT' AND "foodId" IS NULL AND "categoryId" IS NULL AND "nutrient" IS NOT NULL)
  ),
  CONSTRAINT "HealthConditionDietRule_limits_ck" CHECK (("maxPer100g" IS NULL OR "maxPer100g" > 0) AND ("maxPerDay" IS NULL OR "maxPerDay" > 0)),
  CONSTRAINT "HealthConditionDietRule_rule_ck" CHECK (("ruleType" = 'LIMIT' AND ("maxPer100g" IS NOT NULL OR "maxPerDay" IS NOT NULL)) OR ("ruleType" <> 'LIMIT' AND "maxPer100g" IS NULL AND "maxPerDay" IS NULL))
);
CREATE UNIQUE INDEX "HealthConditionDietRule_target_uq" ON "HealthConditionDietRule" ("healthConditionId", "ruleType", "targetType", "foodId", "categoryId", "nutrient") NULLS NOT DISTINCT;

CREATE TABLE "DietaryRule" (
  "id" uuid PRIMARY KEY,
  "dietaryPreference" "DietaryPreference" NOT NULL,
  "ruleType" "DietRuleType" NOT NULL,
  "targetType" "DietRuleTarget" NOT NULL,
  "foodId" uuid REFERENCES "Food"("id") ON DELETE RESTRICT,
  "categoryId" uuid REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "isActive" boolean NOT NULL DEFAULT true,
  CONSTRAINT "DietaryRule_target_ck" CHECK (
    ("targetType" = 'FOOD' AND "foodId" IS NOT NULL AND "categoryId" IS NULL) OR
    ("targetType" = 'CATEGORY' AND "foodId" IS NULL AND "categoryId" IS NOT NULL)
  ),
  CONSTRAINT "DietaryRule_type_ck" CHECK ("ruleType" IN ('AVOID', 'LIMIT'))
);
CREATE UNIQUE INDEX "DietaryRule_target_uq" ON "DietaryRule" ("dietaryPreference", "ruleType", "targetType", "foodId", "categoryId") NULLS NOT DISTINCT;

CREATE TABLE "UserFoodPreference" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "frequency" integer NOT NULL DEFAULT 0,
  "preferenceScore" numeric(4,3) NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserFoodPreference_user_food_uq" UNIQUE ("userId", "foodId"),
  CONSTRAINT "UserFoodPreference_frequency_ck" CHECK ("frequency" >= 0),
  CONSTRAINT "UserFoodPreference_score_ck" CHECK ("preferenceScore" BETWEEN -1 AND 1)
);

CREATE TABLE "UserSafetyProfileEvent" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "entityType" "SafetyEntityType" NOT NULL,
  "entityId" uuid NOT NULL,
  "action" "SafetyEventAction" NOT NULL,
  "snapshot" jsonb NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserSafetyProfileEvent_snapshot_ck" CHECK (jsonb_typeof("snapshot") = 'object' AND NOT ("snapshot" ? 'notes'))
);
CREATE INDEX "UserSafetyProfileEvent_history_ix" ON "UserSafetyProfileEvent" ("userId", "occurredAt" DESC, "id" DESC);

CREATE FUNCTION safety_lock(p_user_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE household_id uuid;
DECLARE user_id uuid;
BEGIN
  FOR household_id IN
    SELECT DISTINCT m."householdId" FROM "HouseholdMember" m
    WHERE m."userId" = ANY(p_user_ids) AND m."leftAt" IS NULL ORDER BY m."householdId"
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('safety-household:' || household_id::text, 0));
  END LOOP;
  FOR user_id IN SELECT DISTINCT unnest(p_user_ids) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('safety-user:' || user_id::text, 0));
  END LOOP;
END $$;

CREATE FUNCTION safety_profile_change_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE relation_name text;
DECLARE entry jsonb;
DECLARE user_id uuid;
DECLARE entity_id uuid;
DECLARE entity_type "SafetyEntityType";
DECLARE event_action "SafetyEventAction";
DECLARE action_name text;
BEGIN
  entity_type := CASE TG_TABLE_NAME
    WHEN 'UserAllergy' THEN 'ALLERGY_FOOD'
    WHEN 'UserAllergyCategory' THEN 'ALLERGY_CATEGORY'
    WHEN 'UserHealthCondition' THEN 'HEALTH_CONDITION'
    WHEN 'UserDietaryPreference' THEN 'DIETARY_PREFERENCE'
    WHEN 'UserDislikedFood' THEN 'DISLIKE_FOOD'
    WHEN 'UserDislikedCategory' THEN 'DISLIKE_CATEGORY'
  END;
  IF TG_OP = 'INSERT' THEN relation_name := TG_ARGV[0]; event_action := 'CREATED'; action_name := 'INSERT';
  ELSIF TG_OP = 'DELETE' THEN relation_name := TG_ARGV[0]; event_action := 'DELETED'; action_name := 'DELETE';
  ELSE relation_name := TG_ARGV[1]; event_action := 'UPDATED'; action_name := 'UPDATE'; END IF;

  FOR entry IN EXECUTE format('SELECT to_jsonb(x) FROM %I x', relation_name) LOOP
    user_id := (entry->>'userId')::uuid;
    entity_id := (entry->>'id')::uuid;
    PERFORM safety_lock(ARRAY[user_id]);
    INSERT INTO "UserSafetyProfileEvent" ("id", "userId", "actorUserId", "entityType", "entityId", "action", "snapshot")
    VALUES (gen_random_uuid(), user_id, user_id, entity_type, entity_id, event_action, entry - 'notes' - 'createdAt' - 'updatedAt');
    INSERT INTO "OutboxEvent" ("topic", "dedupeKey", "payload")
    VALUES ('safety.profile.changed', user_id::text || ':' || txid_current()::text, jsonb_build_object('userId', user_id))
    ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER "UserAllergy_safety_history_insert" AFTER INSERT ON "UserAllergy" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserAllergy_safety_history_update" AFTER UPDATE ON "UserAllergy" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserAllergy_safety_history_delete" AFTER DELETE ON "UserAllergy" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');
CREATE TRIGGER "UserAllergyCategory_safety_history_insert" AFTER INSERT ON "UserAllergyCategory" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserAllergyCategory_safety_history_update" AFTER UPDATE ON "UserAllergyCategory" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserAllergyCategory_safety_history_delete" AFTER DELETE ON "UserAllergyCategory" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');
CREATE TRIGGER "UserHealthCondition_safety_history_insert" AFTER INSERT ON "UserHealthCondition" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserHealthCondition_safety_history_update" AFTER UPDATE ON "UserHealthCondition" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserHealthCondition_safety_history_delete" AFTER DELETE ON "UserHealthCondition" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');
CREATE TRIGGER "UserDietaryPreference_safety_history_insert" AFTER INSERT ON "UserDietaryPreference" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserDietaryPreference_safety_history_update" AFTER UPDATE ON "UserDietaryPreference" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserDietaryPreference_safety_history_delete" AFTER DELETE ON "UserDietaryPreference" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');
CREATE TRIGGER "UserDislikedFood_safety_history_insert" AFTER INSERT ON "UserDislikedFood" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserDislikedFood_safety_history_update" AFTER UPDATE ON "UserDislikedFood" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserDislikedFood_safety_history_delete" AFTER DELETE ON "UserDislikedFood" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');
CREATE TRIGGER "UserDislikedCategory_safety_history_insert" AFTER INSERT ON "UserDislikedCategory" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('new_rows', 'new_rows');
CREATE TRIGGER "UserDislikedCategory_safety_history_update" AFTER UPDATE ON "UserDislikedCategory" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'new_rows');
CREATE TRIGGER "UserDislikedCategory_safety_history_delete" AFTER DELETE ON "UserDislikedCategory" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION safety_profile_change_statement('old_rows', 'old_rows');

CREATE FUNCTION safety_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'UserSafetyProfileEvent is append-only' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER "UserSafetyProfileEvent_append_only" BEFORE UPDATE OR DELETE ON "UserSafetyProfileEvent" FOR EACH ROW EXECUTE FUNCTION safety_event_append_only();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['UserProfile','UserGoal','UserWeightLog','UserPreference','UserDietaryPreference','UserPreferredCuisine','UserDislikedFood','UserDislikedCategory','UserAllergy','UserAllergyCategory','UserHealthCondition','UserFoodPreference','UserSafetyProfileEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("userId"::text = current_setting(''app.user_id'', true)) WITH CHECK ("userId"::text = current_setting(''app.user_id'', true))', table_name || '_owner_only', table_name);
  END LOOP;
END $$;

CREATE INDEX "UserAllergy_food_ix" ON "UserAllergy" ("foodId");
CREATE INDEX "UserAllergyCategory_category_ix" ON "UserAllergyCategory" ("categoryId");
CREATE INDEX "UserHealthCondition_condition_ix" ON "UserHealthCondition" ("healthConditionId");
CREATE INDEX "UserDietaryPreference_diet_ix" ON "UserDietaryPreference" ("dietaryPreference");

