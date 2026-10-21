-- New and returning household members require recommendations to be checked against the new household context.
CREATE OR REPLACE FUNCTION member_joined_safety_reset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' OR (OLD."leftAt" IS NOT NULL AND NEW."leftAt" IS NULL) THEN
    PERFORM safety_lock(ARRAY[NEW."userId"]);
    UPDATE "AIRecommendation" SET status = 'DRAFT', "safetyStatus" = 'PENDING', "statusChangedAt" = now()
      WHERE "householdId" = NEW."householdId" AND status IN ('DRAFT', 'ACTIVE');
    FOR member_user_id IN SELECT "userId" FROM "HouseholdMember" WHERE "householdId" = NEW."householdId" AND "leftAt" IS NULL ORDER BY "userId" LOOP
      INSERT INTO "OutboxEvent" ("householdId", "topic", "dedupeKey", "payload")
      VALUES (NEW."householdId", 'safety.profile.changed', member_user_id::text || ':' || txid_current()::text, jsonb_build_object('userId', member_user_id))
      ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER "HouseholdMember_safety_reset" ON "HouseholdMember";
CREATE TRIGGER "HouseholdMember_safety_reset" AFTER INSERT OR UPDATE OF "leftAt" ON "HouseholdMember" FOR EACH ROW EXECUTE FUNCTION member_joined_safety_reset();
