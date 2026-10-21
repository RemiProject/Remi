-- Complete event/item and adjustment consistency rules discovered while implementing the ledger API.
CREATE OR REPLACE FUNCTION inventory_event_item_food_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_food uuid;
BEGIN
  IF NEW."inventoryItemId" IS NOT NULL THEN
    SELECT "foodId" INTO item_food FROM "InventoryItem"
    WHERE "id" = NEW."inventoryItemId" AND "householdId" = NEW."householdId";
    IF item_food IS DISTINCT FROM NEW."foodId" THEN
      RAISE EXCEPTION 'Food event food must match its inventory item food' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "FoodEvent_item_food_consistency" BEFORE INSERT OR UPDATE OF "foodId", "inventoryItemId", "householdId" ON "FoodEvent"
FOR EACH ROW EXECUTE FUNCTION inventory_event_item_food_consistency();

CREATE OR REPLACE FUNCTION inventory_ledger_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_food uuid; item_food uuid; event_type "FoodEventType";
BEGIN
  SELECT "foodId", "type" INTO event_food, event_type FROM "FoodEvent" WHERE "id" = NEW."foodEventId";
  SELECT "foodId" INTO item_food FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId";
  IF event_food IS DISTINCT FROM item_food THEN
    RAISE EXCEPTION 'Ledger item food must match event food' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (event_type = 'PURCHASED' AND NEW."movementType" = 'PURCHASE_RECEIPT') OR
    (event_type IN ('ADDED', 'LEFTOVER') AND NEW."movementType" = 'ADD') OR
    (event_type = 'EATEN' AND NEW."movementType" = 'CONSUMPTION') OR
    (event_type = 'COOKED' AND NEW."movementType" = 'COOKED') OR
    (event_type = 'WASTED' AND NEW."movementType" = 'DAMAGE_WASTE') OR
    (event_type = 'EXPIRED' AND NEW."movementType" = 'EXPIRED') OR
    (event_type = 'REMOVED' AND NEW."movementType" IN ('REMOVE', 'RETURN', 'STOCK_AUDIT_ADJUSTMENT')) OR
    (event_type = 'ADDED' AND NEW."movementType" = 'STOCK_AUDIT_ADJUSTMENT')
  ) THEN
    RAISE EXCEPTION 'Ledger movement type does not match food event type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
