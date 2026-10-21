-- Phase 7: deterministic freshness and food depletion predictions.
CREATE TYPE "PredictionType" AS ENUM (
  'FOOD_DEPLETION', 'WASTE', 'CONSUMPTION', 'SUPPLY_NEED', 'STOCK_BALANCE', 'COST',
  'NUTRITION_SIGNAL', 'MEAL_DEMAND', 'MEAL_PLAN_ADHERENCE', 'PREFERENCE_TREND', 'RECIPE_USAGE'
);
CREATE TYPE "ImageType" AS ENUM ('RECEIPT', 'FOOD', 'FRESHNESS', 'OTHER');
CREATE TYPE "NutritionMetric" AS ENUM ('CALORIES', 'PROTEIN', 'CARBS', 'FAT', 'FIBER', 'SUGAR', 'SODIUM');
CREATE TYPE "TrendPeriod" AS ENUM ('DAYS_7', 'DAYS_30', 'DAYS_90');

CREATE TABLE "UserNutritionTrend" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "metric" "NutritionMetric" NOT NULL,
  "period" "TrendPeriod" NOT NULL,
  "avgValue" numeric(10,2) NOT NULL,
  "changePercent" numeric(6,2),
  "calculatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserNutritionTrend_user_metric_period_uq" UNIQUE ("userId", "metric", "period")
);
ALTER TABLE "UserNutritionTrend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNutritionTrend" FORCE ROW LEVEL SECURITY;
CREATE POLICY "UserNutritionTrend_owner_only" ON "UserNutritionTrend"
  USING ("userId"::text = current_setting('app.user_id', true))
  WITH CHECK ("userId"::text = current_setting('app.user_id', true));

CREATE TABLE "AIPrediction" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "userId" uuid REFERENCES "User"("id") ON DELETE CASCADE,
  "predictionType" "PredictionType" NOT NULL,
  "summary" text,
  "confidence" numeric(4,3) NOT NULL,
  "modelVersion" text NOT NULL,
  "inputHash" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  CONSTRAINT "AIPrediction_confidence_ck" CHECK ("confidence" BETWEEN 0 AND 1),
  CONSTRAINT "AIPrediction_dates_ck" CHECK ("expiresAt" > "generatedAt"),
  CONSTRAINT "AIPrediction_hash_ck" CHECK ("inputHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AIPrediction_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "AIPrediction_id_type_uq" UNIQUE ("id", "predictionType"),
  CONSTRAINT "AIPrediction_id_type_household_uq" UNIQUE ("id", "predictionType", "householdId"),
  CONSTRAINT "AIPrediction_household_user_fk" FOREIGN KEY ("householdId", "userId") REFERENCES "HouseholdMember"("householdId", "userId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "AIPrediction_input_uq" ON "AIPrediction" ("householdId", "predictionType", "userId", "inputHash") NULLS NOT DISTINCT;
CREATE INDEX "AIPrediction_expiry_ix" ON "AIPrediction" ("expiresAt");
CREATE INDEX "AIPrediction_household_type_generated_ix" ON "AIPrediction" ("householdId", "predictionType", "generatedAt" DESC, "id" DESC);
ALTER TABLE "AIPrediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIPrediction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AIPrediction_household_member" ON "AIPrediction"
  USING ("householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("householdId"::text = current_setting('app.household_id', true));

CREATE TABLE "AIFoodDepletionPrediction" (
  "predictionId" uuid PRIMARY KEY,
  "predictionType" "PredictionType" NOT NULL DEFAULT 'FOOD_DEPLETION',
  "householdId" uuid NOT NULL,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "currentQty" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "avgDailyQty" numeric(12,3) NOT NULL,
  "daysLeft" numeric(8,2) NOT NULL,
  "runOutAt" timestamptz NOT NULL,
  CONSTRAINT "AIFoodDepletionPrediction_type_ck" CHECK ("predictionType" = 'FOOD_DEPLETION'),
  CONSTRAINT "AIFoodDepletionPrediction_qty_ck" CHECK ("currentQty" >= 0 AND "avgDailyQty" > 0 AND "daysLeft" >= 0),
  CONSTRAINT "AIFoodDepletionPrediction_prediction_fk" FOREIGN KEY ("predictionId", "predictionType", "householdId") REFERENCES "AIPrediction"("id", "predictionType", "householdId") ON DELETE CASCADE,
  CONSTRAINT "AIFoodDepletionPrediction_household_food_uq" UNIQUE ("predictionId", "householdId")
);
CREATE INDEX "AIFoodDepletionPrediction_food_ix" ON "AIFoodDepletionPrediction" ("householdId", "foodId");
ALTER TABLE "AIFoodDepletionPrediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIFoodDepletionPrediction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AIFoodDepletionPrediction_household_member" ON "AIFoodDepletionPrediction"
  USING ("householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("householdId"::text = current_setting('app.household_id', true));

CREATE TABLE "Image" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "uploadedByUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "type" "ImageType" NOT NULL,
  "storageKey" text NOT NULL UNIQUE,
  "mimeType" varchar(64) NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Image_mime_type_ck" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  CONSTRAINT "Image_size_bytes_ck" CHECK ("sizeBytes" > 0),
  CONSTRAINT "Image_id_household_uq" UNIQUE ("id", "householdId")
);
CREATE INDEX "Image_household_created_ix" ON "Image" ("householdId", "createdAt" DESC);
ALTER TABLE "Image" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Image" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Image_household_member" ON "Image"
  USING ("householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("householdId"::text = current_setting('app.household_id', true));

CREATE FUNCTION food_depletion_detail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prediction_id uuid;
DECLARE prediction_type "PredictionType";
BEGIN
  prediction_id := COALESCE(NEW."id", OLD."id");
  SELECT "predictionType" INTO prediction_type FROM "AIPrediction" WHERE "id" = prediction_id;
  IF prediction_type = 'FOOD_DEPLETION' AND NOT EXISTS (SELECT 1 FROM "AIFoodDepletionPrediction" WHERE "predictionId" = prediction_id) THEN
    RAISE EXCEPTION 'FOOD_DEPLETION prediction requires its typed detail row' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'AIFoodDepletionPrediction' AND EXISTS (SELECT 1 FROM "AIPrediction" WHERE "id" = prediction_id AND "predictionType" <> 'FOOD_DEPLETION') THEN
    RAISE EXCEPTION 'Food depletion detail requires FOOD_DEPLETION base type' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "AIPrediction_food_depletion_detail_guard"
  AFTER INSERT OR UPDATE ON "AIPrediction" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION food_depletion_detail_guard();
CREATE CONSTRAINT TRIGGER "AIFoodDepletionPrediction_detail_guard"
  AFTER INSERT OR UPDATE OR DELETE ON "AIFoodDepletionPrediction" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION food_depletion_detail_guard();

CREATE TABLE "FreshnessPrediction" (
  "id" uuid PRIMARY KEY,
  "inventoryItemId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  "imageId" uuid NOT NULL,
  "qualityScore" numeric(4,3) NOT NULL,
  "confidence" numeric(4,3) NOT NULL,
  "remainingQualityHours" integer NOT NULL,
  "predictedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FreshnessPrediction_score_ck" CHECK ("qualityScore" BETWEEN 0 AND 1 AND "confidence" BETWEEN 0 AND 1),
  CONSTRAINT "FreshnessPrediction_hours_ck" CHECK ("remainingQualityHours" > 0),
  CONSTRAINT "FreshnessPrediction_item_fk" FOREIGN KEY ("inventoryItemId", "householdId") REFERENCES "InventoryItem"("id", "householdId") ON DELETE CASCADE,
  CONSTRAINT "FreshnessPrediction_image_fk" FOREIGN KEY ("imageId", "householdId") REFERENCES "Image"("id", "householdId") ON DELETE RESTRICT,
  CONSTRAINT "FreshnessPrediction_id_household_uq" UNIQUE ("id", "householdId")
);
CREATE INDEX "FreshnessPrediction_item_time_ix" ON "FreshnessPrediction" ("inventoryItemId", "predictedAt" DESC, "id" DESC);
ALTER TABLE "FreshnessPrediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FreshnessPrediction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FreshnessPrediction_household_member" ON "FreshnessPrediction"
  USING ("householdId"::text = current_setting('app.household_id', true))
  WITH CHECK ("householdId"::text = current_setting('app.household_id', true));

CREATE FUNCTION enqueue_prediction_for_inventory_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE household_id uuid;
BEGIN
  FOR household_id IN EXECUTE format('SELECT DISTINCT "householdId" FROM %I', TG_ARGV[0]) LOOP
    INSERT INTO "OutboxEvent" ("householdId", "topic", "dedupeKey", "payload", "nextAttemptAt")
    VALUES (household_id, 'prediction.food_depletion.requested', household_id::text || ':FOOD_DEPLETION', jsonb_build_object('householdId', household_id), now() + interval '5 minutes')
    ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL
    DO UPDATE SET "payload" = EXCLUDED."payload", "nextAttemptAt" = EXCLUDED."nextAttemptAt", "lastError" = NULL, "attempts" = 0;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER "InventoryTransaction_prediction_enqueue"
  AFTER INSERT ON "InventoryTransaction" REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_prediction_for_inventory_statement('new_rows');

CREATE FUNCTION enqueue_freshness_recompute() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "OutboxEvent" ("householdId", "topic", "dedupeKey", "payload")
  VALUES (NEW."householdId", 'prediction.freshness.recompute', NEW."inventoryItemId"::text || ':' || NEW."householdId"::text,
    jsonb_build_object('householdId', NEW."householdId", 'inventoryItemId', NEW."inventoryItemId"))
  ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL
  DO UPDATE SET "payload" = EXCLUDED."payload", "nextAttemptAt" = now(), "lastError" = NULL, "attempts" = 0;
  RETURN NEW;
END $$;
CREATE TRIGGER "FreshnessPrediction_enqueue_recompute"
  AFTER INSERT ON "FreshnessPrediction" FOR EACH ROW EXECUTE FUNCTION enqueue_freshness_recompute();

CREATE INDEX "InventoryItem_freshness_due_ix" ON "InventoryItem" ("updatedAt") WHERE "freshnessScore" IS NOT NULL AND "archivedAt" IS NULL;
