-- Phase 2: canonical food catalog, products, prices, currencies, and units.
CREATE TYPE "Unit" AS ENUM ('GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'CUP', 'TABLESPOON', 'TEASPOON', 'PIECE');

CREATE TABLE "Currency" (
  "id" uuid PRIMARY KEY,
  "code" char(3) NOT NULL UNIQUE,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "decimalPlaces" smallint NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  CONSTRAINT "Currency_code_upper_ck" CHECK ("code" = upper("code")),
  CONSTRAINT "Currency_decimal_places_ck" CHECK ("decimalPlaces" BETWEEN 0 AND 4)
);

CREATE TABLE "Food" (
  "id" uuid PRIMARY KEY,
  "categoryId" uuid NOT NULL REFERENCES "FoodCategory"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "defaultUnit" "Unit" NOT NULL,
  "gramsPerPiece" numeric(8,2),
  "densityGPerMl" numeric(6,3),
  "archivedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Food_name_nonempty_ck" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "Food_grams_per_piece_ck" CHECK ("gramsPerPiece" IS NULL OR "gramsPerPiece" > 0),
  CONSTRAINT "Food_density_ck" CHECK ("densityGPerMl" IS NULL OR "densityGPerMl" > 0),
  CONSTRAINT "Food_default_unit_ck" CHECK (
    "defaultUnit" NOT IN ('CUP', 'TABLESPOON', 'TEASPOON') AND
    ("defaultUnit" <> 'PIECE' OR "gramsPerPiece" IS NOT NULL) AND
    ("defaultUnit" NOT IN ('MILLILITER', 'LITER') OR "densityGPerMl" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Food_name_lower_uq" ON "Food" (lower("name"));
CREATE INDEX "Food_category_ix" ON "Food" ("categoryId");

CREATE FUNCTION normalize_food_alias(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(replace(replace(replace(regexp_replace(normalize(value, NFKC), '[ً-ٰٟـ]', '', 'g'), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'))
$$;

CREATE TABLE "FoodAlias" (
  "id" uuid PRIMARY KEY,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE CASCADE,
  "languageId" uuid NOT NULL REFERENCES "Language"("id") ON DELETE RESTRICT,
  "alias" text NOT NULL,
  "aliasNormalized" text GENERATED ALWAYS AS (normalize_food_alias("alias")) STORED,
  "isPrimary" boolean NOT NULL DEFAULT false,
  CONSTRAINT "FoodAlias_alias_nonempty_ck" CHECK (length(btrim("alias")) > 0)
);
CREATE UNIQUE INDEX "FoodAlias_language_normalized_uq" ON "FoodAlias" ("languageId", "aliasNormalized");
CREATE UNIQUE INDEX "FoodAlias_primary_language_uq" ON "FoodAlias" ("foodId", "languageId") WHERE "isPrimary";
CREATE INDEX "FoodAlias_food_ix" ON "FoodAlias" ("foodId");

CREATE TABLE "NutritionProfile" (
  "foodId" uuid PRIMARY KEY REFERENCES "Food"("id") ON DELETE CASCADE,
  "caloriesPer100g" numeric(8,2) NOT NULL,
  "proteinG" numeric(8,2) NOT NULL,
  "carbsG" numeric(8,2) NOT NULL,
  "fatG" numeric(8,2) NOT NULL,
  "fiberG" numeric(8,2) NOT NULL,
  "sugarG" numeric(8,2) NOT NULL,
  "sodiumMg" numeric(8,2) NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NutritionProfile_nonnegative_ck" CHECK ("caloriesPer100g" >= 0 AND "proteinG" >= 0 AND "carbsG" >= 0 AND "fatG" >= 0 AND "fiberG" >= 0 AND "sugarG" >= 0 AND "sodiumMg" >= 0),
  CONSTRAINT "NutritionProfile_logic_ck" CHECK ("proteinG" + "carbsG" + "fatG" <= 100.5 AND "caloriesPer100g" <= 900)
);

CREATE TABLE "FoodSubstitution" (
  "id" uuid PRIMARY KEY,
  "originalFoodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "substituteFoodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "ratio" numeric(6,3) NOT NULL,
  "notes" text,
  CONSTRAINT "FoodSubstitution_pair_uq" UNIQUE ("originalFoodId", "substituteFoodId"),
  CONSTRAINT "FoodSubstitution_ratio_ck" CHECK ("ratio" > 0),
  CONSTRAINT "FoodSubstitution_not_self_ck" CHECK ("originalFoodId" <> "substituteFoodId")
);

CREATE TABLE "Product" (
  "id" uuid PRIMARY KEY,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "brand" text,
  "name" text NOT NULL,
  "barcode" text,
  "packageSize" numeric(12,3) NOT NULL,
  "packageUnit" "Unit" NOT NULL,
  "archivedAt" timestamptz,
  CONSTRAINT "Product_package_size_ck" CHECK ("packageSize" > 0),
  CONSTRAINT "Product_id_food_uq" UNIQUE ("id", "foodId")
);
CREATE UNIQUE INDEX "Product_barcode_uq" ON "Product" ("barcode") WHERE "barcode" IS NOT NULL;
CREATE INDEX "Product_food_ix" ON "Product" ("foodId");

CREATE TABLE "ProductSource" (
  "id" uuid PRIMARY KEY,
  "productId" uuid NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "sourceName" text NOT NULL,
  "price" numeric(14,4) NOT NULL,
  "currencyId" uuid NOT NULL REFERENCES "Currency"("id") ON DELETE RESTRICT,
  "available" boolean NOT NULL DEFAULT false,
  "leadTimeDays" integer,
  "sourceUrl" text,
  "priceObservedAt" timestamptz NOT NULL,
  CONSTRAINT "ProductSource_pair_uq" UNIQUE ("productId", "sourceName"),
  CONSTRAINT "ProductSource_price_ck" CHECK ("price" >= 0),
  CONSTRAINT "ProductSource_lead_time_ck" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0)
);

INSERT INTO "Currency" ("id", "code", "name", "symbol", "decimalPlaces")
VALUES ('019a0000-0000-7000-8000-000000000001', 'EGP', 'Egyptian Pound', 'ج.م', 2),
       ('019a0000-0000-7000-8000-000000000002', 'USD', 'US Dollar', '$', 2)
ON CONFLICT ("code") DO NOTHING;
