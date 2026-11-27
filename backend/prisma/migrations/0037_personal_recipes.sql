-- Personal recipes: a recipe someone adds belongs to them as well as to the household it was added in.
--  * createdByUserId: who added it. Household members still see and use it (shared cookbook).
--  * When that person joins or creates another household, their recipes are copied there (trigger below), so they
--    keep them on any account/household. The old household keeps its copy, so its plans and history stay intact.
--  * originRecipeId: the first recipe of a copy chain; a household never gets the same recipe twice.
--  * createdByName: the author's name, kept when they delete their account (the User row is anonymized).
ALTER TABLE "Recipe"
  ADD COLUMN "createdByUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  ADD COLUMN "createdByName" text,
  ADD COLUMN "originRecipeId" uuid REFERENCES "Recipe"("id") ON DELETE SET NULL;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_author_household_ck" CHECK ("householdId" IS NOT NULL OR ("createdByUserId" IS NULL AND "originRecipeId" IS NULL));
CREATE INDEX "Recipe_author_ix" ON "Recipe" ("createdByUserId", "householdId") WHERE "createdByUserId" IS NOT NULL;
CREATE INDEX "Recipe_household_origin_ix" ON "Recipe" ("householdId", (COALESCE("originRecipeId", "id"))) WHERE "householdId" IS NOT NULL;

-- Copies every live recipe p_user added in their other households into p_household. Idempotent: a recipe whose
-- chain already has a row in p_household (even an archived one, so a deliberate removal sticks) is skipped.
-- Runs as the caller: it reads each source household under that household's own RLS context, writes under the
-- target's, and restores the caller's context before returning.
CREATE FUNCTION copy_member_recipes(p_household uuid, p_user uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  saved_household text := current_setting('app.household_id', true);
  source_household uuid;
  src record;
  new_recipe uuid;
  copied integer := 0;
  pending jsonb := '[]'::jsonb;
BEGIN
  -- 1) Read: every household the person ever belonged to, under that household's own context.
  FOR source_household IN
    SELECT DISTINCT m."householdId" FROM public."HouseholdMember" m
    WHERE m."userId" = p_user AND m."householdId" <> p_household ORDER BY 1
  LOOP
    PERFORM set_config('app.household_id', source_household::text, true);
    pending := pending || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'root', COALESCE(r."originRecipeId", r."id"), 'createdAt', r."createdAt",
        'recipe', to_jsonb(r) - 'id' - 'householdId' - 'createdAt' - 'updatedAt' - 'archivedAt' - 'originRecipeId',
        'ingredients', COALESCE((SELECT jsonb_agg(to_jsonb(i) - 'id' - 'recipeId') FROM public."RecipeIngredient" i WHERE i."recipeId" = r."id"), '[]'::jsonb),
        'steps', COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'id' - 'recipeId') FROM public."RecipeStep" s WHERE s."recipeId" = r."id"), '[]'::jsonb),
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('position', l."position", 'text', l."text", 'foodId', li."foodId"))
                 FROM public."RecipeIngredientLine" l LEFT JOIN public."RecipeIngredient" li ON li."id" = l."recipeIngredientId"
                 WHERE l."recipeId" = r."id"), '[]'::jsonb)))
      FROM public."Recipe" r
      WHERE r."householdId" = source_household AND r."createdByUserId" = p_user AND r."archivedAt" IS NULL), '[]'::jsonb);
  END LOOP;

  -- 2) Write: one copy per chain (the newest version), under the target household's context.
  PERFORM set_config('app.household_id', p_household::text, true);
  FOR src IN
    SELECT DISTINCT ON (e->>'root') e AS entry FROM jsonb_array_elements(pending) e
    ORDER BY e->>'root', (e->>'createdAt')::timestamptz DESC
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public."Recipe" t
      WHERE t."householdId" = p_household AND COALESCE(t."originRecipeId", t."id") = (src.entry->>'root')::uuid);
    new_recipe := gen_random_uuid();
    INSERT INTO public."Recipe" ("id", "householdId", "cuisineId", "name", "description", "servings", "prepTimeMin", "cookTimeMin",
      "difficulty", "sourceUrl", "sourceName", "imageUrl", "createdByUserId", "createdByName", "originRecipeId")
    SELECT new_recipe, p_household, x."cuisineId", x."name", x."description", x."servings", x."prepTimeMin", x."cookTimeMin",
      x."difficulty", x."sourceUrl", x."sourceName", x."imageUrl", p_user, x."createdByName", (src.entry->>'root')::uuid
    FROM jsonb_populate_record(NULL::public."Recipe", src.entry->'recipe') x;
    INSERT INTO public."RecipeIngredient" ("id", "recipeId", "foodId", "quantity", "unit", "optional")
    SELECT gen_random_uuid(), new_recipe, x."foodId", x."quantity", x."unit", x."optional"
    FROM jsonb_populate_recordset(NULL::public."RecipeIngredient", src.entry->'ingredients') x;
    INSERT INTO public."RecipeStep" ("id", "recipeId", "stepNumber", "instruction", "durationMin")
    SELECT gen_random_uuid(), new_recipe, x."stepNumber", x."instruction", x."durationMin"
    FROM jsonb_populate_recordset(NULL::public."RecipeStep", src.entry->'steps') x;
    INSERT INTO public."RecipeIngredientLine" ("id", "recipeId", "position", "text", "recipeIngredientId")
    SELECT gen_random_uuid(), new_recipe, (l->>'position')::integer, l->>'text',
      (SELECT i."id" FROM public."RecipeIngredient" i WHERE i."recipeId" = new_recipe AND i."foodId" = (l->>'foodId')::uuid)
    FROM jsonb_array_elements(src.entry->'lines') l;
    copied := copied + 1;
  END LOOP;

  PERFORM set_config('app.household_id', COALESCE(saved_household, ''), true);
  RETURN copied;
END $$;
REVOKE ALL ON FUNCTION copy_member_recipes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION copy_member_recipes(uuid, uuid) TO kitchen_runtime;

-- Joining (first time or rejoining) a household brings the person's recipes along, whatever code path did the join.
CREATE FUNCTION member_joined_copy_recipes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD."leftAt" IS NOT NULL AND NEW."leftAt" IS NULL) THEN
    PERFORM copy_member_recipes(NEW."householdId", NEW."userId");
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "HouseholdMember_copy_recipes" AFTER INSERT OR UPDATE OF "leftAt" ON "HouseholdMember"
  FOR EACH ROW EXECUTE FUNCTION member_joined_copy_recipes();
