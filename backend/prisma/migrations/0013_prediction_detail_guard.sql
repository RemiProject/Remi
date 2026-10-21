-- Correct the typed-detail trigger to read the appropriate PK from either table.
CREATE OR REPLACE FUNCTION food_depletion_detail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prediction_id uuid;
DECLARE prediction_type "PredictionType";
BEGIN
  IF TG_TABLE_NAME = 'AIPrediction' THEN
    prediction_id := COALESCE(NEW."id", OLD."id");
  ELSE
    prediction_id := COALESCE(NEW."predictionId", OLD."predictionId");
  END IF;
  SELECT "predictionType" INTO prediction_type FROM "AIPrediction" WHERE "id" = prediction_id;
  IF prediction_type = 'FOOD_DEPLETION' AND NOT EXISTS (SELECT 1 FROM "AIFoodDepletionPrediction" WHERE "predictionId" = prediction_id) THEN
    RAISE EXCEPTION 'FOOD_DEPLETION prediction requires its typed detail row' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'AIFoodDepletionPrediction' AND prediction_type IS NOT NULL AND prediction_type <> 'FOOD_DEPLETION' THEN
    RAISE EXCEPTION 'Food depletion detail requires FOOD_DEPLETION base type' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
