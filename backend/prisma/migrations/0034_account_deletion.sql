-- Account deletion (App Store guideline 5.1.1(v); erasure of personal data). The safety-profile history is append-only
-- so nobody can rewrite it, but a person deleting their account must be able to erase their own history. The
-- exception holds only inside the deletion transaction (app.account_erasure) and only for that user's rows.
CREATE OR REPLACE FUNCTION safety_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.account_erasure', true) = 'true'
     AND OLD."userId"::text = current_setting('app.user_id', true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'UserSafetyProfileEvent is append-only' USING ERRCODE = '42501';
END $$;
