-- Receipt scanning briefly suggested COUNTER for room-temperature fruit, which the app can show but not edit.
-- Room temperature is PANTRY in the app; move those receipt purchases there so people can edit them.
UPDATE "InventoryItem" i SET "storageLocation" = 'PANTRY'
WHERE i."storageLocation" = 'COUNTER'
  AND EXISTS (SELECT 1 FROM "FoodEvent" e WHERE e."inventoryItemId" = i."id" AND e."source" = 'RECEIPT');
