-- Phase 3: household inventory batches, causal events, and an append-only ledger.
CREATE TYPE "ItemOrigin" AS ENUM ('HOME', 'AWAY', 'UNKNOWN');
CREATE TYPE "FoodEventType" AS ENUM ('PURCHASED', 'SCANNED', 'ADDED', 'OPENED', 'COOKED', 'EATEN', 'LEFTOVER', 'WASTED', 'EXPIRED', 'REMOVED');
CREATE TYPE "EventSource" AS ENUM ('USER', 'RECEIPT', 'PHOTO', 'VOICE', 'SYSTEM', 'AI', 'N8N');
CREATE TYPE "StorageLocation" AS ENUM ('FRIDGE', 'FREEZER', 'PANTRY', 'COUNTER', 'OTHER');
CREATE TYPE "InventoryTransactionType" AS ENUM ('PURCHASE_RECEIPT', 'ADD', 'CONSUMPTION', 'COOKED', 'DAMAGE_WASTE', 'STOCK_AUDIT_ADJUSTMENT', 'RETURN', 'REMOVE', 'EXPIRED');

CREATE TABLE "InventoryItem" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "productId" uuid,
  "quantity" numeric(12,3) NOT NULL DEFAULT 0,
  "unit" "Unit" NOT NULL,
  "storageLocation" "StorageLocation" NOT NULL DEFAULT 'PANTRY',
  "purchaseDate" date,
  "openedDate" date,
  "estimatedExpiryAt" timestamptz,
  "freshnessScore" numeric(4,3),
  "version" integer NOT NULL DEFAULT 1,
  "archivedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "InventoryItem_product_food_fk" FOREIGN KEY ("productId", "foodId") REFERENCES "Product"("id", "foodId") ON DELETE RESTRICT,
  CONSTRAINT "InventoryItem_quantity_ck" CHECK ("quantity" >= 0),
  CONSTRAINT "InventoryItem_version_ck" CHECK ("version" > 0),
  CONSTRAINT "InventoryItem_freshness_ck" CHECK ("freshnessScore" IS NULL OR "freshnessScore" BETWEEN 0 AND 1),
  CONSTRAINT "InventoryItem_opened_date_ck" CHECK ("openedDate" IS NULL OR "purchaseDate" IS NULL OR "openedDate" >= "purchaseDate"),
  CONSTRAINT "InventoryItem_id_household_uq" UNIQUE ("id", "householdId")
);
CREATE INDEX "InventoryItem_household_food_live_ix" ON "InventoryItem" ("householdId", "foodId") WHERE "archivedAt" IS NULL;
CREATE INDEX "InventoryItem_household_expiry_live_ix" ON "InventoryItem" ("householdId", "estimatedExpiryAt") WHERE "archivedAt" IS NULL;

CREATE TABLE "FoodEvent" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "inventoryItemId" uuid,
  "type" "FoodEventType" NOT NULL,
  "origin" "ItemOrigin" NOT NULL,
  "source" "EventSource" NOT NULL DEFAULT 'USER',
  "quantity" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FoodEvent_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "FoodEvent_key_ck" CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  CONSTRAINT "FoodEvent_origin_item_ck" CHECK ("origin" = 'HOME' OR "inventoryItemId" IS NULL),
  CONSTRAINT "FoodEvent_item_household_fk" FOREIGN KEY ("inventoryItemId", "householdId") REFERENCES "InventoryItem"("id", "householdId") ON DELETE RESTRICT,
  CONSTRAINT "FoodEvent_id_household_origin_uq" UNIQUE ("id", "householdId", "origin"),
  CONSTRAINT "FoodEvent_household_key_uq" UNIQUE ("householdId", "idempotencyKey")
);
CREATE INDEX "FoodEvent_household_occurred_ix" ON "FoodEvent" ("householdId", "occurredAt" DESC, "id" DESC);

CREATE TABLE "InventoryTransaction" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "inventoryItemId" uuid NOT NULL,
  "foodEventId" uuid NOT NULL,
  "origin" "ItemOrigin" NOT NULL DEFAULT 'HOME',
  "movementType" "InventoryTransactionType" NOT NULL,
  "quantityDelta" numeric(12,3) NOT NULL,
  "balanceAfter" numeric(12,3) NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "InventoryTransaction_item_household_fk" FOREIGN KEY ("inventoryItemId", "householdId") REFERENCES "InventoryItem"("id", "householdId") ON DELETE RESTRICT,
  CONSTRAINT "InventoryTransaction_event_household_origin_fk" FOREIGN KEY ("foodEventId", "householdId", "origin") REFERENCES "FoodEvent"("id", "householdId", "origin") ON DELETE RESTRICT,
  CONSTRAINT "InventoryTransaction_origin_ck" CHECK ("origin" = 'HOME'),
  CONSTRAINT "InventoryTransaction_delta_ck" CHECK ("quantityDelta" <> 0),
  CONSTRAINT "InventoryTransaction_balance_ck" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "InventoryTransaction_sign_ck" CHECK (
    ("movementType" IN ('PURCHASE_RECEIPT', 'ADD') AND "quantityDelta" > 0) OR
    ("movementType" IN ('CONSUMPTION', 'COOKED', 'DAMAGE_WASTE', 'REMOVE', 'EXPIRED') AND "quantityDelta" < 0) OR
    "movementType" IN ('STOCK_AUDIT_ADJUSTMENT', 'RETURN')
  ),
  CONSTRAINT "InventoryTransaction_household_key_uq" UNIQUE ("householdId", "idempotencyKey"),
  CONSTRAINT "InventoryTransaction_event_item_uq" UNIQUE ("foodEventId", "inventoryItemId")
);
CREATE INDEX "InventoryTransaction_item_history_ix" ON "InventoryTransaction" ("inventoryItemId", "createdAt", "id");
CREATE INDEX "InventoryTransaction_created_brin_ix" ON "InventoryTransaction" USING BRIN ("createdAt");

CREATE FUNCTION inventory_guard_item_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."unit" IS DISTINCT FROM OLD."unit" AND EXISTS (SELECT 1 FROM "InventoryTransaction" WHERE "inventoryItemId" = OLD."id") THEN
    RAISE EXCEPTION 'Inventory item unit is immutable after its first ledger row' USING ERRCODE = '23514';
  END IF;
  IF (NEW."quantity", NEW."version") IS DISTINCT FROM (OLD."quantity", OLD."version")
     AND current_setting('app.inventory_ledger_write', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Inventory quantity and version can only be changed by InventoryLedger' USING ERRCODE = '42501';
  END IF;
  NEW."updatedAt" := now();
  RETURN NEW;
END $$;
CREATE TRIGGER "InventoryItem_guard_update" BEFORE UPDATE ON "InventoryItem" FOR EACH ROW EXECUTE FUNCTION inventory_guard_item_update();

CREATE FUNCTION inventory_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'InventoryTransaction is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER "InventoryTransaction_append_only" BEFORE UPDATE OR DELETE ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_append_only();

CREATE FUNCTION inventory_ledger_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
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
    (event_type = 'REMOVED' AND NEW."movementType" IN ('REMOVE', 'RETURN')) OR
    (event_type = 'ADDED' AND NEW."movementType" = 'STOCK_AUDIT_ADJUSTMENT')
  ) THEN
    RAISE EXCEPTION 'Ledger movement type does not match food event type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "InventoryTransaction_consistency" BEFORE INSERT ON "InventoryTransaction" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_consistency();

CREATE FUNCTION inventory_event_requires_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."origin" = 'HOME' AND NEW."type" NOT IN ('SCANNED', 'OPENED') AND NOT EXISTS (
    SELECT 1 FROM "InventoryTransaction" WHERE "foodEventId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'HOME inventory event requires at least one ledger transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "FoodEvent_requires_ledger" AFTER INSERT ON "FoodEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_event_requires_ledger();

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InventoryItem_household_policy" ON "InventoryItem" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "FoodEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoodEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FoodEvent_household_policy" ON "FoodEvent" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "InventoryTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryTransaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InventoryTransaction_household_policy" ON "InventoryTransaction" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
