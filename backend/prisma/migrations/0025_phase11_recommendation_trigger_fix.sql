-- Keep record-field access specific to the triggering table and operation.
-- The prior combined boolean expression could dereference HouseholdMember fields
-- while invoked for AIRecommendation rows.
CREATE OR REPLACE FUNCTION ai_member_active_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE hid uuid; uid uuid;
BEGIN
  IF TG_TABLE_NAME = 'HouseholdMember' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NULL; END IF;
    hid := OLD."householdId";
    uid := OLD."userId";
    IF OLD."leftAt" IS NULL AND NEW."leftAt" IS NOT NULL THEN
      UPDATE public."AIRecommendation"
      SET status = 'EXPIRED', "safetyStatus" = 'BLOCKED', "statusChangedAt" = now()
      WHERE "householdId" = hid AND "userId" = uid AND status IN ('DRAFT', 'ACTIVE');
    END IF;
    RETURN NULL;
  END IF;

  hid := NEW."householdId";
  uid := NEW."userId";
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."HouseholdMember"
    WHERE "householdId" = hid AND "userId" = uid AND "leftAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'ai_member_active_guard: recommendation requires active member' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
