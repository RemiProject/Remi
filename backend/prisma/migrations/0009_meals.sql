-- Phase 4: meals, nutrition snapshots, daily summaries, and planning.
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER');

CREATE TABLE "Meal" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "userId" uuid NOT NULL,
  "mealType" "MealType" NOT NULL,
  "eatenAt" timestamptz NOT NULL,
  "origin" "ItemOrigin" NOT NULL,
  "name" text,
  "idempotencyKey" text NOT NULL,
  "requestHash" char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Meal_member_fk" FOREIGN KEY ("householdId", "userId") REFERENCES "HouseholdMember"("householdId", "userId") ON DELETE RESTRICT,
  CONSTRAINT "Meal_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "Meal_id_household_origin_uq" UNIQUE ("id", "householdId", "origin"),
  CONSTRAINT "Meal_household_user_key_uq" UNIQUE ("householdId", "userId", "idempotencyKey"),
  CONSTRAINT "Meal_key_ck" CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  CONSTRAINT "Meal_name_ck" CHECK ("name" IS NULL OR length(btrim("name")) BETWEEN 1 AND 200)
);
CREATE INDEX "Meal_user_eaten_ix" ON "Meal" ("userId", "eatenAt" DESC, "id" DESC);
CREATE INDEX "Meal_household_eaten_ix" ON "Meal" ("householdId", "eatenAt" DESC, "id" DESC);

CREATE FUNCTION meal_active_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HouseholdMember" m WHERE m."householdId" = NEW."householdId" AND m."userId" = NEW."userId" AND m."leftAt" IS NULL) THEN
    RAISE EXCEPTION 'Meal can only be logged for an active household member' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Meal_active_member_guard" BEFORE INSERT OR UPDATE OF "householdId", "userId" ON "Meal" FOR EACH ROW EXECUTE FUNCTION meal_active_member_guard();

CREATE TABLE "MealItem" (
  "id" uuid PRIMARY KEY,
  "mealId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "quantity" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "quantityG" numeric(10,2) NOT NULL,
  "calories" numeric(8,2),
  "proteinG" numeric(8,2),
  "carbsG" numeric(8,2),
  "fatG" numeric(8,2),
  "fiberG" numeric(8,2),
  "sugarG" numeric(8,2),
  "sodiumMg" numeric(8,2),
  "nutritionSnapshotAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MealItem_meal_household_fk" FOREIGN KEY ("mealId", "householdId") REFERENCES "Meal"("id", "householdId") ON DELETE CASCADE,
  CONSTRAINT "MealItem_quantity_ck" CHECK ("quantity" > 0 AND "quantityG" > 0),
  CONSTRAINT "MealItem_nutrition_ck" CHECK (
    ("calories" IS NULL OR "calories" >= 0) AND ("proteinG" IS NULL OR "proteinG" >= 0) AND
    ("carbsG" IS NULL OR "carbsG" >= 0) AND ("fatG" IS NULL OR "fatG" >= 0) AND
    ("fiberG" IS NULL OR "fiberG" >= 0) AND ("sugarG" IS NULL OR "sugarG" >= 0) AND ("sodiumMg" IS NULL OR "sodiumMg" >= 0)
  ),
  CONSTRAINT "MealItem_meal_food_uq" UNIQUE ("mealId", "foodId")
);
CREATE INDEX "MealItem_meal_ix" ON "MealItem" ("mealId");

CREATE TABLE "MealPlan" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MealPlan_range_ck" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "MealPlan_name_ck" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "MealPlan_id_household_uq" UNIQUE ("id", "householdId")
);
CREATE INDEX "MealPlan_household_range_ix" ON "MealPlan" ("householdId", "startDate", "endDate");

CREATE TABLE "PlannedMeal" (
  "id" uuid PRIMARY KEY,
  "mealPlanId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  "recipeId" uuid NOT NULL REFERENCES "Recipe"("id") ON DELETE RESTRICT,
  "mealDate" date NOT NULL,
  "mealType" "MealType" NOT NULL,
  "servings" numeric(5,2) NOT NULL,
  CONSTRAINT "PlannedMeal_plan_household_fk" FOREIGN KEY ("mealPlanId", "householdId") REFERENCES "MealPlan"("id", "householdId") ON DELETE CASCADE,
  CONSTRAINT "PlannedMeal_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "PlannedMeal_plan_date_type_recipe_uq" UNIQUE ("mealPlanId", "mealDate", "mealType", "recipeId"),
  CONSTRAINT "PlannedMeal_servings_ck" CHECK ("servings" > 0)
);
CREATE INDEX "PlannedMeal_household_date_ix" ON "PlannedMeal" ("householdId", "mealDate", "mealType");

CREATE FUNCTION planned_meal_date_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_start date; plan_end date;
BEGIN
  SELECT "startDate", "endDate" INTO plan_start, plan_end FROM "MealPlan" WHERE "id" = NEW."mealPlanId" AND "householdId" = NEW."householdId";
  IF NOT FOUND OR NEW."mealDate" < plan_start OR NEW."mealDate" > plan_end THEN
    RAISE EXCEPTION 'Planned meal date must be inside its meal plan range' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlannedMeal_date_guard" BEFORE INSERT OR UPDATE OF "mealPlanId", "householdId", "mealDate" ON "PlannedMeal" FOR EACH ROW EXECUTE FUNCTION planned_meal_date_guard();
CREATE TRIGGER "PlannedMeal_recipe_scope_guard" BEFORE INSERT OR UPDATE OF "recipeId" ON "PlannedMeal" FOR EACH ROW EXECUTE FUNCTION recipe_scope_guard();

CREATE TABLE "UserDailyNutrition" (
  "id" uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "calories" numeric(10,2) NOT NULL DEFAULT 0,
  "proteinG" numeric(10,2) NOT NULL DEFAULT 0,
  "carbsG" numeric(10,2) NOT NULL DEFAULT 0,
  "fatG" numeric(10,2) NOT NULL DEFAULT 0,
  "fiberG" numeric(10,2) NOT NULL DEFAULT 0,
  "sugarG" numeric(10,2) NOT NULL DEFAULT 0,
  "sodiumMg" numeric(10,2) NOT NULL DEFAULT 0,
  "mealCount" integer NOT NULL DEFAULT 0,
  "isFinal" boolean NOT NULL DEFAULT false,
  "computedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserDailyNutrition_user_date_uq" UNIQUE ("userId", "date"),
  CONSTRAINT "UserDailyNutrition_nonnegative_ck" CHECK ("calories" >= 0 AND "proteinG" >= 0 AND "carbsG" >= 0 AND "fatG" >= 0 AND "fiberG" >= 0 AND "sugarG" >= 0 AND "sodiumMg" >= 0 AND "mealCount" >= 0)
);
CREATE INDEX "UserDailyNutrition_date_ix" ON "UserDailyNutrition" ("userId", "date" DESC);

ALTER TABLE "Meal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Meal_household_scope" ON "Meal" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
CREATE POLICY "Meal_owner_read_scope" ON "Meal" FOR SELECT USING ("userId"::text = current_setting('app.user_id', true));
ALTER TABLE "MealItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MealItem_household_scope" ON "MealItem" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
CREATE POLICY "MealItem_owner_read_scope" ON "MealItem" FOR SELECT USING (EXISTS (SELECT 1 FROM "Meal" m WHERE m."id" = "mealId" AND m."userId"::text = current_setting('app.user_id', true)));
ALTER TABLE "MealPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealPlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MealPlan_household_scope" ON "MealPlan" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "PlannedMeal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannedMeal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PlannedMeal_household_scope" ON "PlannedMeal" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "UserDailyNutrition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserDailyNutrition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "UserDailyNutrition_owner_scope" ON "UserDailyNutrition" USING ("userId"::text = current_setting('app.user_id', true)) WITH CHECK ("userId"::text = current_setting('app.user_id', true));
