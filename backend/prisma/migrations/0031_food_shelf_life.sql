-- Average shelf life of fresh foods, from USDA FSIS FoodKeeper (data/foodkeeper-produce.psv, mapped by
-- data/shelf-life.csv). Days are stored per storage place; a NULL range means FoodKeeper gives no figure.
CREATE TABLE "FoodShelfLife" (
  "foodId" uuid PRIMARY KEY REFERENCES "Food"("id") ON DELETE CASCADE,
  "foodkeeperId" integer NOT NULL,
  "roomMinDays" integer, "roomMaxDays" integer,
  -- FoodKeeper says "when ripe": keep at room temperature until ripe, with no fixed number of days.
  "ripensAtRoomTemp" boolean NOT NULL DEFAULT false,
  "fridgeMinDays" integer, "fridgeMaxDays" integer,
  "freezerMinDays" integer, "freezerMaxDays" integer,
  "freezeNotRecommended" boolean NOT NULL DEFAULT false,
  "source" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FoodShelfLife_room_range_ck" CHECK ("roomMinDays" IS NULL OR ("roomMinDays" > 0 AND "roomMaxDays" >= "roomMinDays")),
  CONSTRAINT "FoodShelfLife_fridge_range_ck" CHECK ("fridgeMinDays" IS NULL OR ("fridgeMinDays" > 0 AND "fridgeMaxDays" >= "fridgeMinDays")),
  CONSTRAINT "FoodShelfLife_freezer_range_ck" CHECK ("freezerMinDays" IS NULL OR ("freezerMinDays" > 0 AND "freezerMaxDays" >= "freezerMinDays"))
);
GRANT SELECT ON TABLE "FoodShelfLife" TO kitchen_runtime;

-- True when Remi filled the expiry from shelf-life averages; false when a person entered it.
ALTER TABLE "InventoryItem" ADD COLUMN "expiryEstimated" boolean NOT NULL DEFAULT false;
