-- Guide B17A: a food belongs to more than one safety category (cake = gluten + dairy + eggs),
-- and a packaged product carries label tags (CONTAINS / MAY_CONTAIN). Guide §12: recommendation reasons.

CREATE TYPE "ProductTagKind" AS ENUM ('CONTAINS', 'MAY_CONTAIN');

-- Extra safety categories of a food. Food.categoryId stays the display category; safety = primary + these.
CREATE TABLE "FoodCategoryMembership" (
  "id" uuid PRIMARY KEY,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE CASCADE,
  "categoryId" uuid NOT NULL REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FoodCategoryMembership_food_category_uq" UNIQUE ("foodId", "categoryId")
);
CREATE INDEX "FoodCategoryMembership_category_ix" ON "FoodCategoryMembership" ("categoryId");

-- Label data of a packaged product, written by product import (barcode data), never by users.
CREATE TABLE "ProductSafetyTag" (
  "id" uuid PRIMARY KEY,
  "productId" uuid NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "categoryId" uuid NOT NULL REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "kind" "ProductTagKind" NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ProductSafetyTag_product_category_uq" UNIQUE ("productId", "categoryId")
);
CREATE INDEX "ProductSafetyTag_category_ix" ON "ProductSafetyTag" ("categoryId");

-- Catalog data: the runtime role reads it, seeds/migrator write it (same rule as 0026).
GRANT SELECT ON TABLE "FoodCategoryMembership", "ProductSafetyTag" TO kitchen_runtime;

-- Single definition of "the safety categories of a food", shared by every safety call site.
CREATE FUNCTION food_safety_category_ids(p_food uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT ARRAY(
    SELECT f."categoryId" FROM public."Food" f WHERE f.id = p_food
    UNION
    SELECT m."categoryId" FROM public."FoodCategoryMembership" m WHERE m."foodId" = p_food
    ORDER BY 1
  )
$$;

-- Fail closed: a catalog safety change sends every open recommendation for the affected foods back
-- through the safety worker, exactly like a profile change does (0016).
CREATE FUNCTION catalog_safety_change_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_user uuid;
BEGIN
  FOR affected_user IN EXECUTE format($q$
      SELECT DISTINCT r."userId" FROM public."AIRecommendation" r
      JOIN public."AIShoppingRecommendation" d ON d."recommendationId" = r.id
      WHERE r.status IN ('DRAFT', 'ACTIVE') AND r."userId" IS NOT NULL
        AND d."foodId" IN (SELECT %s FROM %I)
      ORDER BY 1$q$,
      CASE TG_TABLE_NAME WHEN 'FoodCategoryMembership' THEN '"foodId"'
        ELSE '(SELECT p."foodId" FROM public."Product" p WHERE p.id = "productId")' END,
      TG_ARGV[0])
  LOOP
    PERFORM safety_lock(ARRAY[affected_user]);
    UPDATE public."AIRecommendation" SET status = 'DRAFT', "safetyStatus" = 'PENDING', "statusChangedAt" = now()
      WHERE "userId" = affected_user AND status IN ('DRAFT', 'ACTIVE');
    INSERT INTO public."OutboxEvent" ("topic", "dedupeKey", "payload")
      VALUES ('safety.profile.changed', affected_user::text || ':' || txid_current()::text, jsonb_build_object('userId', affected_user))
      ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER "FoodCategoryMembership_safety_insert" AFTER INSERT ON "FoodCategoryMembership"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');
CREATE TRIGGER "FoodCategoryMembership_safety_update" AFTER UPDATE ON "FoodCategoryMembership"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');
CREATE TRIGGER "FoodCategoryMembership_safety_delete" AFTER DELETE ON "FoodCategoryMembership"
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');
CREATE TRIGGER "ProductSafetyTag_safety_insert" AFTER INSERT ON "ProductSafetyTag"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');
CREATE TRIGGER "ProductSafetyTag_safety_update" AFTER UPDATE ON "ProductSafetyTag"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');
CREATE TRIGGER "ProductSafetyTag_safety_delete" AFTER DELETE ON "ProductSafetyTag"
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION catalog_safety_change_statement('changed');

-- "Why are we recommending this?" One row per reason code. Codes are an open list the client translates.
CREATE TABLE "AIRecommendationReason" (
  "id" uuid PRIMARY KEY,
  "recommendationId" uuid NOT NULL REFERENCES "AIRecommendation"("id") ON DELETE CASCADE,
  "code" varchar(64) NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "AIRecommendationReason_code_ck" CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT "AIRecommendationReason_recommendation_code_uq" UNIQUE ("recommendationId", "code")
);

ALTER TABLE "AIRecommendationReason" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AIRecommendationReason_user_household_scope" ON "AIRecommendationReason"
  USING (EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId"::text = NULLIF(current_setting('app.household_id', true), '')
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "AIRecommendation" r WHERE r.id = "recommendationId"
      AND r."householdId"::text = NULLIF(current_setting('app.household_id', true), '')
      AND r."userId"::text = NULLIF(current_setting('app.user_id', true), '')));
GRANT SELECT, INSERT, DELETE ON TABLE "AIRecommendationReason" TO kitchen_runtime;
