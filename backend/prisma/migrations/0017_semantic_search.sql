-- Phase 9 foundation: pgvector-backed search documents and transactional source triggers.
-- pgvector must be installed on the PostgreSQL server before applying this migration.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "SearchDocumentSource" AS ENUM ('FOOD', 'RECIPE', 'MEAL');
CREATE TYPE "SearchEmbeddingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "SearchDocument" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceType" "SearchDocumentSource" NOT NULL,
  "sourceId" uuid NOT NULL,
  "householdId" uuid,
  "content" text NOT NULL,
  "embeddedContentHash" char(64),
  "embedding" vector(384),
  "embeddingStatus" "SearchEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  "embeddingClaimedAt" timestamptz,
  "embeddingUpdatedAt" timestamptz,
  "lastEmbeddingError" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SearchDocument_source_uq" UNIQUE ("sourceType", "sourceId"),
  CONSTRAINT "SearchDocument_content_ck" CHECK (length(btrim("content")) > 0),
  CONSTRAINT "SearchDocument_scope_ck" CHECK (
    ("sourceType" = 'FOOD' AND "householdId" IS NULL) OR
    ("sourceType" = 'RECIPE') OR
    ("sourceType" = 'MEAL' AND "householdId" IS NOT NULL)
  )
);
CREATE INDEX "SearchDocument_embedding_pending_ix" ON "SearchDocument" ("updatedAt")
  WHERE "embeddingStatus" IN ('PENDING', 'FAILED');
CREATE INDEX "SearchDocument_scope_type_ix" ON "SearchDocument" ("householdId", "sourceType");

CREATE FUNCTION search_document_upsert(p_type "SearchDocumentSource", p_id uuid, p_household uuid, p_content text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_content IS NULL OR length(btrim(p_content)) = 0 THEN
    DELETE FROM "SearchDocument" WHERE "sourceType" = p_type AND "sourceId" = p_id;
    RETURN;
  END IF;
  INSERT INTO "SearchDocument" ("sourceType", "sourceId", "householdId", "content")
  VALUES (p_type, p_id, p_household, p_content)
  ON CONFLICT ("sourceType", "sourceId") DO UPDATE SET
    "householdId" = EXCLUDED."householdId",
    "content" = EXCLUDED."content",
    "embeddingStatus" = CASE WHEN "SearchDocument"."content" IS DISTINCT FROM EXCLUDED."content"
      OR "SearchDocument"."householdId" IS DISTINCT FROM EXCLUDED."householdId"
      THEN 'PENDING'::"SearchEmbeddingStatus" ELSE "SearchDocument"."embeddingStatus" END,
    "embeddingClaimedAt" = CASE WHEN "SearchDocument"."content" IS DISTINCT FROM EXCLUDED."content"
      OR "SearchDocument"."householdId" IS DISTINCT FROM EXCLUDED."householdId"
      THEN NULL ELSE "SearchDocument"."embeddingClaimedAt" END,
    "lastEmbeddingError" = CASE WHEN "SearchDocument"."content" IS DISTINCT FROM EXCLUDED."content"
      OR "SearchDocument"."householdId" IS DISTINCT FROM EXCLUDED."householdId"
      THEN NULL ELSE "SearchDocument"."lastEmbeddingError" END,
    "updatedAt" = CASE WHEN "SearchDocument"."content" IS DISTINCT FROM EXCLUDED."content"
      OR "SearchDocument"."householdId" IS DISTINCT FROM EXCLUDED."householdId"
      THEN now() ELSE "SearchDocument"."updatedAt" END;
END;
$$;

CREATE FUNCTION search_document_refresh_food(p_food_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE content_text text;
BEGIN
  SELECT concat_ws('. ', f."name", c."name",
    (SELECT string_agg(a."alias", ', ' ORDER BY a."alias") FROM "FoodAlias" a WHERE a."foodId" = f."id"))
    INTO content_text
    FROM "Food" f JOIN "FoodCategory" c ON c."id" = f."categoryId"
    WHERE f."id" = p_food_id AND f."archivedAt" IS NULL;
  PERFORM search_document_upsert('FOOD', p_food_id, NULL, content_text);
END;
$$;
CREATE FUNCTION search_document_food_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE food_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    food_id := OLD."id";
    PERFORM search_document_refresh_food(food_id);
    PERFORM search_document_refresh_recipe(r."recipeId") FROM "RecipeIngredient" r WHERE r."foodId" = food_id;
    RETURN OLD;
  END IF;
  food_id := NEW."id";
  PERFORM search_document_refresh_food(food_id);
  PERFORM search_document_refresh_recipe(r."recipeId") FROM "RecipeIngredient" r WHERE r."foodId" = food_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Food_search_document_sync" AFTER INSERT OR UPDATE OR DELETE ON "Food"
  FOR EACH ROW EXECUTE FUNCTION search_document_food_trigger();
CREATE FUNCTION search_document_food_alias_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_document_refresh_food(OLD."foodId");
    RETURN OLD;
  END IF;
  PERFORM search_document_refresh_food(NEW."foodId");
  IF TG_OP = 'UPDATE' AND OLD."foodId" IS DISTINCT FROM NEW."foodId" THEN
    PERFORM search_document_refresh_food(OLD."foodId");
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FoodAlias_search_document_sync" AFTER INSERT OR UPDATE OR DELETE ON "FoodAlias"
  FOR EACH ROW EXECUTE FUNCTION search_document_food_alias_trigger();
CREATE FUNCTION search_document_category_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM search_document_refresh_food(f."id") FROM "Food" f WHERE f."categoryId" = NEW."id";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FoodCategory_search_document_sync" AFTER UPDATE OF "name" ON "FoodCategory"
  FOR EACH ROW EXECUTE FUNCTION search_document_category_trigger();

CREATE FUNCTION search_document_refresh_recipe(p_recipe_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE content_text text; scope_id uuid;
BEGIN
  SELECT concat_ws('. ', r."name", r."description",
    (SELECT string_agg(f."name", ', ' ORDER BY f."name") FROM "RecipeIngredient" i JOIN "Food" f ON f."id" = i."foodId" WHERE i."recipeId" = r."id")),
    r."householdId"
    INTO content_text, scope_id FROM "Recipe" r
    WHERE r."id" = p_recipe_id AND r."archivedAt" IS NULL;
  PERFORM search_document_upsert('RECIPE', p_recipe_id, scope_id, content_text);
END;
$$;
CREATE FUNCTION search_document_recipe_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_document_refresh_recipe(OLD."id");
    RETURN OLD;
  END IF;
  PERFORM search_document_refresh_recipe(NEW."id");
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Recipe_search_document_sync" AFTER INSERT OR UPDATE OR DELETE ON "Recipe"
  FOR EACH ROW EXECUTE FUNCTION search_document_recipe_trigger();
CREATE FUNCTION search_document_recipe_ingredient_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM search_document_refresh_recipe(OLD."recipeId");
    RETURN OLD;
  END IF;
  PERFORM search_document_refresh_recipe(NEW."recipeId");
  IF TG_OP = 'UPDATE' AND OLD."recipeId" IS DISTINCT FROM NEW."recipeId" THEN
    PERFORM search_document_refresh_recipe(OLD."recipeId");
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RecipeIngredient_search_document_sync" AFTER INSERT OR UPDATE OR DELETE ON "RecipeIngredient"
  FOR EACH ROW EXECUTE FUNCTION search_document_recipe_ingredient_trigger();

-- Meals are household-scoped diary records. Only the optional user-entered title is indexed;
-- ingredients, nutrients, dates, and user/profile data are deliberately excluded.
CREATE FUNCTION search_document_meal_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "SearchDocument" WHERE "sourceType" = 'MEAL' AND "sourceId" = OLD."id";
    RETURN OLD;
  END IF;
  PERFORM search_document_upsert('MEAL', NEW."id", NEW."householdId", NEW."name");
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Meal_search_document_sync" AFTER INSERT OR UPDATE OF "name", "householdId" OR DELETE ON "Meal"
  FOR EACH ROW EXECUTE FUNCTION search_document_meal_trigger();

-- Initial backfill is explicit and precedes HNSW creation.
SELECT search_document_refresh_food(id) FROM "Food";
SELECT search_document_refresh_recipe(id) FROM "Recipe";
SELECT search_document_upsert('MEAL', id, "householdId", name) FROM "Meal" WHERE name IS NOT NULL;
