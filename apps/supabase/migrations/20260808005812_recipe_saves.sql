-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.save_recipe_copy (
  p_recipe_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  src    public.recipes;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into src
  from public.recipes r
  where r.id = p_recipe_id
    and (
      r.owner_id = v_user
      or r.owner_id is null
      or (r.is_public and r.review_status = 'approved')
    );

  if src.id is null then
    raise exception 'recipe not found';
  end if;

  -- NOT the photograph. An object key names one object under ONE user's prefix,
  -- and `ownsKey` is what stands between two users' diaries — a copy carrying
  -- the original author's key could never be signed for its new owner, so the
  -- tile would be permanently blank. Worse, it would ALIAS: the original author
  -- deleting their recipe deletes that object, and every copy of it goes dark.
  -- The illustration copies, because a drawing belongs to nobody.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, food_id, amount, unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new, i.name, i.food_id, i.amount, i.unit,
    i.kcal_per_unit, i.carbs_g_per_unit, i.protein_g_per_unit, i.fat_g_per_unit,
    i.position
  from public.recipe_ingredients i
  where i.recipe_id = src.id;

  -- Not on a copy of your own recipe: duplicating something to try a variation
  -- is not a vote for it.
  --
  -- And ONCE PER PERSON. The ledger's primary key is what decides that, so a
  -- second save by the same person conflicts, inserts nothing, leaves `found`
  -- false and never reaches the counter. Bumped on every call, the column
  -- counted saves rather than people — and the community shelf is ordered by
  -- it, so saving your own favourite twenty times was a way to the top of it.
  if src.owner_id is distinct from v_user then
    insert into public.recipe_saves (recipe_id, user_id)
    values (src.id, v_user)
    on conflict do nothing;

    if found then
      update public.recipes set saved_count = saved_count + 1 where id = src.id;
    end if;
  end if;

  return v_new;
end;
$function$;

COMMENT ON FUNCTION public.save_recipe_copy(uuid) IS 'Copy a visible recipe and its ingredients into the caller''s own, recording where it came from and counting the caller as one saver of the original, however many copies they make. Returns the new recipe id.';

CREATE TABLE public.recipe_saves (
  recipe_id uuid                     NOT NULL,
  user_id   uuid                     NOT NULL,
  saved_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_saves
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_saves
  ADD CONSTRAINT recipe_saves_pkey PRIMARY KEY (recipe_id, user_id);

ALTER TABLE public.recipe_saves
  ADD CONSTRAINT recipe_saves_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE public.recipe_saves
  ADD CONSTRAINT recipe_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_saves TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_saves TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_saves TO service_role;
-- ---------------------------------------------------------------------------
-- Migration unit 2: the ledger, backfilled
-- Transaction mode: transactional
--
-- DATA rather than structure, so it lives here and not in `schemas/`: a schema
-- file only ever shapes the shadow database during a diff, and rows written
-- there reach no migration. Same exception the archetype seed is.
--
-- Reconstructed from the copies themselves, which is the only record of a save
-- that exists before this table did. `source_recipe_id` says which recipe a copy
-- came from and `owner_id` says who made it, so DISTINCT over the pair is
-- exactly the ledger the counter should have been keeping — and it collapses
-- the double counting in the same pass, since one person's three copies of a
-- recipe are three rows here and one row after the distinct.
--
-- Copies of your own recipe are left out, matching `save_recipe_copy`:
-- duplicating something to try a variation is not a vote for it.
-- ---------------------------------------------------------------------------
INSERT INTO public.recipe_saves (recipe_id, user_id)
SELECT DISTINCT copy.source_recipe_id, copy.owner_id
FROM public.recipes copy
JOIN public.recipes src ON src.id = copy.source_recipe_id
WHERE copy.owner_id IS NOT NULL
  AND copy.owner_id IS DISTINCT FROM src.owner_id
ON CONFLICT DO NOTHING;

-- The counter is now a cache of the ledger, so it is recomputed rather than
-- adjusted: whatever it drifted to before this, the row count is the answer.
UPDATE public.recipes r
SET saved_count = (
  SELECT count(*) FROM public.recipe_saves v WHERE v.recipe_id = r.id
);
