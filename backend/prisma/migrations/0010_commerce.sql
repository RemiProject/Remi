-- Phase 5: shopping intent and purchasing records.
CREATE TYPE "ShoppingListStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ShoppingItemStatus" AS ENUM ('NEEDED', 'PURCHASED', 'SKIPPED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "ShoppingList" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "status" "ShoppingListStatus" NOT NULL DEFAULT 'ACTIVE',
  "idempotencyKey" text NOT NULL,
  "requestHash" char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ShoppingList_name_ck" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "ShoppingList_key_ck" CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  CONSTRAINT "ShoppingList_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "ShoppingList_household_key_uq" UNIQUE ("householdId", "idempotencyKey")
);
CREATE INDEX "ShoppingList_household_status_ix" ON "ShoppingList" ("householdId", "status", "updatedAt" DESC);

CREATE TABLE "PurchaseOrder" (
  "id" uuid PRIMARY KEY,
  "householdId" uuid NOT NULL REFERENCES "Household"("id") ON DELETE RESTRICT,
  "createdByUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "productSourceId" uuid REFERENCES "ProductSource"("id") ON DELETE RESTRICT,
  "sourceName" text NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "totalCost" numeric(14,4) NOT NULL DEFAULT 0,
  "currencyId" uuid NOT NULL REFERENCES "Currency"("id") ON DELETE RESTRICT,
  "orderedAt" timestamptz,
  "confirmedAt" timestamptz,
  "deliveredAt" timestamptz,
  "idempotencyKey" text NOT NULL,
  "requestHash" char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PurchaseOrder_source_ck" CHECK (length(btrim("sourceName")) BETWEEN 1 AND 200),
  CONSTRAINT "PurchaseOrder_total_ck" CHECK ("totalCost" >= 0),
  CONSTRAINT "PurchaseOrder_key_ck" CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  CONSTRAINT "PurchaseOrder_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "PurchaseOrder_household_key_uq" UNIQUE ("householdId", "idempotencyKey"),
  CONSTRAINT "PurchaseOrder_id_currency_uq" UNIQUE ("id", "currencyId")
);
CREATE INDEX "PurchaseOrder_household_created_ix" ON "PurchaseOrder" ("householdId", "createdAt" DESC, "id" DESC);

CREATE TABLE "PurchaseOrderItem" (
  "id" uuid PRIMARY KEY,
  "purchaseOrderId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "productId" uuid,
  "quantity" numeric(12,3) NOT NULL,
  "receivedQuantity" numeric(12,3) NOT NULL DEFAULT 0,
  "unit" "Unit" NOT NULL,
  "unitPrice" numeric(14,4) NOT NULL,
  "totalPrice" numeric(14,4) GENERATED ALWAYS AS (round("quantity" * "unitPrice", 4)) STORED,
  "currencyId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PurchaseOrderItem_order_household_fk" FOREIGN KEY ("purchaseOrderId", "householdId") REFERENCES "PurchaseOrder"("id", "householdId") ON DELETE CASCADE,
  CONSTRAINT "PurchaseOrderItem_order_currency_fk" FOREIGN KEY ("purchaseOrderId", "currencyId") REFERENCES "PurchaseOrder"("id", "currencyId") ON DELETE RESTRICT,
  CONSTRAINT "PurchaseOrderItem_product_food_fk" FOREIGN KEY ("productId", "foodId") REFERENCES "Product"("id", "foodId") ON DELETE RESTRICT,
  CONSTRAINT "PurchaseOrderItem_id_household_uq" UNIQUE ("id", "householdId"),
  CONSTRAINT "PurchaseOrderItem_id_household_food_unit_uq" UNIQUE ("id", "householdId", "foodId", "unit"),
  CONSTRAINT "PurchaseOrderItem_quantity_ck" CHECK ("quantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity"),
  CONSTRAINT "PurchaseOrderItem_price_ck" CHECK ("unitPrice" >= 0)
);
CREATE INDEX "PurchaseOrderItem_order_ix" ON "PurchaseOrderItem" ("purchaseOrderId", "id");

CREATE TABLE "ShoppingListItem" (
  "id" uuid PRIMARY KEY,
  "shoppingListId" uuid NOT NULL,
  "householdId" uuid NOT NULL,
  "foodId" uuid NOT NULL REFERENCES "Food"("id") ON DELETE RESTRICT,
  "productId" uuid,
  "quantity" numeric(12,3) NOT NULL,
  "unit" "Unit" NOT NULL,
  "status" "ShoppingItemStatus" NOT NULL DEFAULT 'NEEDED',
  "idempotencyKey" text NOT NULL,
  "requestHash" char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ShoppingListItem_list_household_fk" FOREIGN KEY ("shoppingListId", "householdId") REFERENCES "ShoppingList"("id", "householdId") ON DELETE CASCADE,
  CONSTRAINT "ShoppingListItem_product_food_fk" FOREIGN KEY ("productId", "foodId") REFERENCES "Product"("id", "foodId") ON DELETE RESTRICT,
  CONSTRAINT "ShoppingListItem_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "ShoppingListItem_key_ck" CHECK (length("idempotencyKey") BETWEEN 1 AND 200),
  CONSTRAINT "ShoppingListItem_household_key_uq" UNIQUE ("householdId", "idempotencyKey")
);
CREATE UNIQUE INDEX "ShoppingListItem_needed_food_uq" ON "ShoppingListItem" ("shoppingListId", "foodId") WHERE "status" = 'NEEDED';
CREATE INDEX "ShoppingListItem_list_ix" ON "ShoppingListItem" ("shoppingListId", "status", "id");

ALTER TABLE "FoodEvent" ADD COLUMN "purchaseOrderItemId" uuid;
ALTER TABLE "FoodEvent" ADD CONSTRAINT "FoodEvent_purchase_item_household_fk" FOREIGN KEY ("purchaseOrderItemId", "householdId") REFERENCES "PurchaseOrderItem"("id", "householdId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "FoodEvent_purchase_item_uq" ON "FoodEvent" ("purchaseOrderItemId") WHERE "type" = 'PURCHASED' AND "purchaseOrderItemId" IS NOT NULL;

CREATE FUNCTION purchase_order_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PLACED', 'CANCELLED')) OR
    (OLD."status" = 'PLACED' AND NEW."status" IN ('CONFIRMED', 'CANCELLED')) OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('DELIVERED', 'CANCELLED')) OR
    (OLD."status" = 'DELIVERED' AND NEW."status" = 'DELIVERED') OR
    (OLD."status" = 'CANCELLED' AND NEW."status" = 'CANCELLED')
  ) THEN RAISE EXCEPTION 'Invalid purchase order state transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PurchaseOrder_state_guard" BEFORE UPDATE OF "status" ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION purchase_order_state_guard();

CREATE FUNCTION purchase_order_total_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id uuid;
DECLARE order_total numeric(14,4);
DECLARE item_total numeric(14,4);
BEGIN
  IF TG_TABLE_NAME = 'PurchaseOrder' THEN
    order_id := COALESCE(NEW."id", OLD."id");
  ELSE
    order_id := COALESCE(NEW."purchaseOrderId", OLD."purchaseOrderId");
  END IF;
  SELECT "totalCost" INTO order_total FROM "PurchaseOrder" WHERE "id" = order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum("totalPrice"), 0)::numeric(14,4) INTO item_total FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = order_id;
  IF order_total <> item_total THEN RAISE EXCEPTION 'Purchase order total must equal the sum of item totals' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "PurchaseOrder_total_guard" AFTER INSERT OR UPDATE ON "PurchaseOrder" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION purchase_order_total_guard();
CREATE CONSTRAINT TRIGGER "PurchaseOrderItem_total_guard" AFTER INSERT OR UPDATE OR DELETE ON "PurchaseOrderItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION purchase_order_total_guard();

ALTER TABLE "ShoppingList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShoppingList" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ShoppingList_household_scope" ON "ShoppingList" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "ShoppingListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShoppingListItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ShoppingListItem_household_scope" ON "ShoppingListItem" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PurchaseOrder_household_scope" ON "PurchaseOrder" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
ALTER TABLE "PurchaseOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrderItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PurchaseOrderItem_household_scope" ON "PurchaseOrderItem" USING ("householdId"::text = current_setting('app.household_id', true)) WITH CHECK ("householdId"::text = current_setting('app.household_id', true));
