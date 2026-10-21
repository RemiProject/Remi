-- Phase 4 start: household/global recipes, ingredients, and ordered instructions.
CREATE TYPE "RecipeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

CREATE TABLE "Recipe" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid REFERENCES "Household"("id") ON DELETE RESTRICT,
  "cuisineId" uuid REFERENCES "Cuisine"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "description" text,
  "servings" integer NOT NULL,
  "prepTimeMin" integer,
  "cookTimeMin" integer,
  "difficulty" "RecipeDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "archivedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Recipe_name_ck" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "Recipe_servings_ck" CHECK ("servings" > 0),
  CONSTRAINT "Recipe_prep_time_ck" CHECK ("prepTimeMin" IS NULL OR "prepTimeMin" >= 0),
  CONSTRAINT "Recipe_cook_time_ck" CHECK ("cookTimeMin" IS NULL OR "cookTimeMin" >= 0),
  CONSTRAINT "Recipe_id_household_uq" UNIQUE ("id", "householdId")
);
CREATE INDEX "Recipe_household_live_ix" ON "Recipe" ("householdId", "id") WHERE "householdId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE INDEX "Recipe_global_live_ix" ON "Recipe" ("id") WHERE "householdId" IS NULL AND "archivedAt" IS NULL;

CREATE TABLE "RecipeIngredient" (
  "id" uuid PRIMARY KEY,
  "recipeId" uuid NOT NULL REFERENCES "Recipe"("id") ON DELETE CASCADE,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "quantity" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "optional" boolean NOT NULL DEFAULT false,
  CONSTRAINT "RecipeIngredient_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "RecipeIngredient_recipe_food_uq" UNIQUE ("recipeId", "foodId")
);
CREATE INDEX "RecipeIngredient_food_ix" ON "RecipeIngredient" ("foodId");

CREATE TABLE "RecipeStep" (
  "id" uuid PRIMARY KEY,
  "recipeId" uuid NOT NULL REFERENCES "Recipe"("id") ON DELETE CASCADE,
  "stepNumber" integer NOT NULL,
  "instruction" text NOT NULL,
  "durationMin" integer,
  CONSTRAINT "RecipeStep_number_ck" CHECK ("stepNumber" > 0),
  CONSTRAINT "RecipeStep_instruction_ck" CHECK (length(btrim("instruction")) > 0),
  CONSTRAINT "RecipeStep_duration_ck" CHECK ("durationMin" IS NULL OR "durationMin" >= 0),
  CONSTRAINT "RecipeStep_recipe_number_uq" UNIQUE ("recipeId", "stepNumber")
);

CREATE FUNCTION recipe_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipe_household uuid; current_household text;
BEGIN
  SELECT "householdId" INTO recipe_household FROM "Recipe" WHERE "id" = NEW."recipeId" AND "archivedAt" IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe does not exist or is archived' USING ERRCODE = '23503';
  END IF;
  current_household := NULLIF(current_setting('app.household_id', true), '');
  IF recipe_household IS NOT NULL AND recipe_household::text IS DISTINCT FROM current_household THEN
    RAISE EXCEPTION 'Recipe belongs to another household' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RecipeIngredient_scope_guard" BEFORE INSERT OR UPDATE OF "recipeId" ON "RecipeIngredient" FOR EACH ROW EXECUTE FUNCTION recipe_scope_guard();
CREATE TRIGGER "RecipeStep_scope_guard" BEFORE INSERT OR UPDATE OF "recipeId" ON "RecipeStep" FOR EACH ROW EXECUTE FUNCTION recipe_scope_guard();

ALTER TABLE "Recipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Recipe" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Recipe_read_scope" ON "Recipe" FOR SELECT USING ("householdId" IS NULL OR "householdId"::text = current_setting('app.household_id', true));
CREATE POLICY "Recipe_private_write_scope" ON "Recipe" FOR INSERT WITH CHECK ("householdId" IS NOT NULL AND "householdId"::text = current_setting('app.household_id', true));
CREATE POLICY "Recipe_private_update_scope" ON "Recipe" FOR UPDATE USING ("householdId" IS NOT NULL AND "householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId" IS NOT NULL AND "householdId"::text = current_setting('app.household_id', true));

ALTER TABLE "RecipeIngredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecipeIngredient" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RecipeIngredient_read_scope" ON "RecipeIngredient" FOR SELECT USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND (r."householdId" IS NULL OR r."householdId"::text = current_setting('app.household_id', true))));
CREATE POLICY "RecipeIngredient_write_scope" ON "RecipeIngredient" FOR ALL USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true)));

ALTER TABLE "RecipeStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecipeStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RecipeStep_read_scope" ON "RecipeStep" FOR SELECT USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND (r."householdId" IS NULL OR r."householdId"::text = current_setting('app.household_id', true))));
CREATE POLICY "RecipeStep_write_scope" ON "RecipeStep" FOR ALL USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true)));
