-- Phase 11: the runtime API consumes global catalog/reference data but does not
-- own data-entry workflows. Keep catalog writes and migration metadata on the
-- separate migrator/seed credentials.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM kitchen_runtime;

REVOKE ALL ON TABLE "_migrations" FROM kitchen_runtime;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  "Country", "Cuisine", "Currency", "DietaryRule", "Food", "FoodAlias",
  "FoodCategory", "FoodSubstitution", "HealthCondition", "HealthConditionDietRule",
  "Language", "Locale", "NutritionProfile", "Product", "ProductSource"
FROM kitchen_runtime;

GRANT SELECT ON TABLE
  "Country", "Cuisine", "Currency", "DietaryRule", "Food", "FoodAlias",
  "FoodCategory", "FoodSubstitution", "HealthCondition", "HealthConditionDietRule",
  "Language", "Locale", "NutritionProfile", "Product", "ProductSource"
TO kitchen_runtime;
