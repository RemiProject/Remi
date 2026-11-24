-- USDA does not analyse every nutrient for every food (for example sugar in spices, grains and herbs).
-- Store "not reported" as NULL instead of 0 so recipe and meal totals never present a missing value as zero.
ALTER TABLE "NutritionProfile" ALTER COLUMN "fiberG" DROP NOT NULL;
ALTER TABLE "NutritionProfile" ALTER COLUMN "sugarG" DROP NOT NULL;
