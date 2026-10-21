-- On UPDATE, retain the post-change row as the audit snapshot.
CREATE OR REPLACE FUNCTION safety_profile_change_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE relation_name text; entry jsonb; user_id uuid; entity_id uuid; entity_type "SafetyEntityType"; event_action "SafetyEventAction";
BEGIN
  entity_type := CASE TG_TABLE_NAME WHEN 'UserAllergy' THEN 'ALLERGY_FOOD' WHEN 'UserAllergyCategory' THEN 'ALLERGY_CATEGORY'
    WHEN 'UserHealthCondition' THEN 'HEALTH_CONDITION' WHEN 'UserDietaryPreference' THEN 'DIETARY_PREFERENCE'
    WHEN 'UserDislikedFood' THEN 'DISLIKE_FOOD' WHEN 'UserDislikedCategory' THEN 'DISLIKE_CATEGORY' END;
  IF TG_OP = 'INSERT' THEN relation_name := TG_ARGV[0]; event_action := 'CREATED';
  ELSIF TG_OP = 'DELETE' THEN relation_name := TG_ARGV[0]; event_action := 'DELETED';
  ELSE relation_name := TG_ARGV[1]; event_action := 'UPDATED'; END IF;
  FOR entry IN EXECUTE format('SELECT to_jsonb(x) FROM %I x', relation_name) LOOP
    user_id := (entry->>'userId')::uuid; entity_id := (entry->>'id')::uuid;
    PERFORM safety_lock(ARRAY[user_id]);
    UPDATE "AIRecommendation" SET status = 'DRAFT', "safetyStatus" = 'PENDING', "statusChangedAt" = now()
      WHERE "userId" = user_id AND status IN ('DRAFT', 'ACTIVE');
    INSERT INTO "UserSafetyProfileEvent" ("id", "userId", "actorUserId", "entityType", "entityId", "action", "snapshot")
      VALUES (gen_random_uuid(), user_id, user_id, entity_type, entity_id, event_action, entry - 'notes' - 'createdAt' - 'updatedAt');
    INSERT INTO "OutboxEvent" ("topic", "dedupeKey", "payload")
      VALUES ('safety.profile.changed', user_id::text || ':' || txid_current()::text, jsonb_build_object('userId', user_id))
      ON CONFLICT ("topic", "dedupeKey") WHERE "processedAt" IS NULL AND "deadLetteredAt" IS NULL DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;
