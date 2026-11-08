-- Recipes saved from a link ("My recipes"): where they came from, their photo, and the ingredient lines exactly as the
-- page printed them. Lines that match a catalogue food also become RecipeIngredient rows (nutrition, kitchen
-- matching, shopping); the rest stay readable text so nothing from the page is lost.
ALTER TABLE "Recipe" ADD COLUMN "sourceUrl" text, ADD COLUMN "sourceName" text, ADD COLUMN "imageUrl" text;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_source_url_ck" CHECK ("sourceUrl" IS NULL OR "sourceUrl" ~ '^https?://');
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_image_url_ck" CHECK ("imageUrl" IS NULL OR "imageUrl" ~ '^https?://');
CREATE INDEX "Recipe_household_source_ix" ON "Recipe" ("householdId", "sourceUrl") WHERE "sourceUrl" IS NOT NULL AND "archivedAt" IS NULL;

CREATE TABLE "RecipeIngredientLine" (
  "id" uuid PRIMARY KEY,
  "recipeId" uuid NOT NULL REFERENCES "Recipe"("id") ON DELETE CASCADE,
  "position" integer NOT NULL CHECK ("position" > 0),
  "text" text NOT NULL CHECK (length("text") BETWEEN 1 AND 500),
  "recipeIngredientId" uuid REFERENCES "RecipeIngredient"("id") ON DELETE SET NULL,
  CONSTRAINT "RecipeIngredientLine_position_uq" UNIQUE ("recipeId", "position")
);
ALTER TABLE "RecipeIngredientLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecipeIngredientLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RecipeIngredientLine_read_scope" ON "RecipeIngredientLine" FOR SELECT USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND (r."householdId" IS NULL OR r."householdId"::text = current_setting('app.household_id', true))));
CREATE POLICY "RecipeIngredientLine_write_scope" ON "RecipeIngredientLine" FOR ALL USING (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "Recipe" r WHERE r."id" = "recipeId" AND r."householdId"::text = current_setting('app.household_id', true)));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RecipeIngredientLine" TO kitchen_runtime;
