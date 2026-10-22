-- The expiry notification sweep runs across households, so it needs a global partial index.
CREATE INDEX "InventoryItem_expiry_candidate_ix" ON "InventoryItem" ("estimatedExpiryAt", id)
  WHERE "archivedAt" IS NULL AND quantity > 0;
