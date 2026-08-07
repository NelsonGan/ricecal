-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE TYPE public.recipe_review AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE public.recipe_unit AS ENUM (
  'g',
  'ml',
  'piece'
);

CREATE FUNCTION public.profiles_sync_recipe_author()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.recipes
  set author_name = coalesce(new.display_name, '')
  where owner_id = new.id and author_name is distinct from coalesce(new.display_name, '');
  return null;
end;
$function$;

CREATE FUNCTION public.recipe_ingredients_after_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_recipe_id uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  perform public.recipe_sync_food(v_recipe_id);
  perform public.recipe_mark_for_review(v_recipe_id);
  return null;
end;
$function$;

CREATE FUNCTION public.recipe_mark_for_review (
  p_recipe_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.recipes
  set review_status = 'pending', review_note = null
  where id = p_recipe_id and is_public and review_status <> 'pending';
end;
$function$;

GRANT ALL ON FUNCTION public.recipe_mark_for_review(uuid) TO service_role;

CREATE FUNCTION public.recipe_sync_food (
  p_recipe_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  r          public.recipes;
  v_total    record;
  v_servings numeric;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then
    return;
  end if;

  v_servings := greatest(r.servings, 1);

  select
    coalesce(sum(i.kcal_per_unit      * i.amount), 0) as kcal,
    coalesce(sum(i.carbs_g_per_unit   * i.amount), 0) as carbs_g,
    coalesce(sum(i.protein_g_per_unit * i.amount), 0) as protein_g,
    coalesce(sum(i.fat_g_per_unit     * i.amount), 0) as fat_g
  into v_total
  from public.recipe_ingredients i
  where i.recipe_id = r.id;

  update public.foods set
    name      = r.name,
    icon_set  = r.icon_set,
    icon_name = r.icon_name,
    -- Per serving, which is what one entry against this row means. Clamped to
    -- the column's own range so a mistyped ingredient cannot make the recipe
    -- unsaveable — the number is visibly wrong on screen either way, and a
    -- check-constraint violation on a trigger reads to the user as "saving
    -- failed" with nothing to fix.
    kcal      = least(round(v_total.kcal / v_servings), 10000),
    -- Clamped for the same reason kcal is, and it is not optional: `foods`
    -- holds these as numeric(6, 1) while an ingredient may be 100000 units of
    -- something at 999999.9999 g of carbohydrate each. One fat-fingered amount
    -- overflows the column INSIDE this trigger, and a numeric overflow raised
    -- from a trigger reaches the user as "saving failed" with nothing on screen
    -- to correct. A visibly absurd number they can fix is the better failure.
    carbs_g   = least(round(v_total.carbs_g   / v_servings, 1), 99999.9),
    protein_g = least(round(v_total.protein_g / v_servings, 1), 99999.9),
    fat_g     = least(round(v_total.fat_g     / v_servings, 1), 99999.9),
    is_recipe = true,
    place     = 'home'
  where id = r.food_id;

  -- One serving is the base portion and is always factor 1: the macros above
  -- are quoted per serving, so this is the row they describe.
  insert into public.food_servings (food_id, slug, label, factor, is_default, position)
  values (r.food_id, 'serving', '1 serving', 1.0, true, 0)
  on conflict (food_id, slug) do update set label = excluded.label, factor = 1.0;

  insert into public.food_servings (food_id, slug, label, factor, is_default, position)
  values (r.food_id, 'half', 'Half', 0.5, false, 1)
  on conflict (food_id, slug) do update set factor = 0.5;

  if r.servings >= 2 then
    insert into public.food_servings (food_id, slug, label, factor, is_default, position)
    values (r.food_id, 'two', '2 servings', 2.0, false, 2)
    on conflict (food_id, slug) do update set factor = 2.0;
  else
    delete from public.food_servings where food_id = r.food_id and slug = 'two';
  end if;

  -- Strictly greater than TWO, not than one: on a recipe that feeds two, the
  -- whole pot IS the '2 servings' portion above, and two rows with the same
  -- factor are the same amount of food said twice.
  if r.servings > 2 then
    insert into public.food_servings (food_id, slug, label, factor, is_default, position)
    values (r.food_id, 'pot', 'Whole pot', r.servings, false, 3)
    on conflict (food_id, slug) do update set factor = excluded.factor;
  else
    delete from public.food_servings where food_id = r.food_id and slug = 'pot';
  end if;
end;
$function$;

COMMENT ON FUNCTION public.recipe_sync_food(uuid) IS 'Rebuilds a recipe''s mirror `foods` row and its portions from the recipe and its ingredients. Called by the recipe triggers; the mirror is derived data and this is its only writer.';

GRANT ALL ON FUNCTION public.recipe_sync_food(uuid) TO service_role;

CREATE FUNCTION public.recipes_after_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (select 1 from public.food_logs e where e.food_id = old.food_id) then
    return null;
  end if;

  delete from public.food_servings where food_id = old.food_id;
  delete from public.foods where id = old.food_id;
  return null;
end;
$function$;

CREATE FUNCTION public.recipes_after_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.recipe_sync_food(new.id);
  return null;
end;
$function$;

CREATE FUNCTION public.recipes_before_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_stem text;
begin
  if new.food_id is null then
    insert into public.foods (slug, name, place, kcal, carbs_g, protein_g, fat_g,
                              icon_set, icon_name, verified, is_recipe, source)
    values ('recipe-' || pg_catalog.gen_random_uuid()::text, new.name, 'home',
            0, 0, 0, 0, new.icon_set, new.icon_name, false, true, 'recipe')
    returning id into new.food_id;
  end if;

  if new.share_slug is null then
    -- `search_normalize` folds accents and case; the rest turns what is left
    -- into link-safe words. A name that is entirely punctuation leaves nothing,
    -- hence the fallback stem.
    v_stem := pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(public.search_normalize(new.name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    );
    v_stem := pg_catalog.left(coalesce(nullif(v_stem, ''), 'recipe'), 40);
    -- Eight hex characters off a fresh uuid. `gen_random_bytes` would be the
    -- obvious source and lives in pgcrypto, which this database does not
    -- install; a v4 uuid is the same CSPRNG and is already here.
    new.share_slug := v_stem || '-' || pg_catalog.left(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 8
    );
  end if;

  new.author_name := coalesce(
    (select p.display_name from public.profiles p where p.id = new.owner_id),
    ''
  );

  return new;
end;
$function$;

CREATE FUNCTION public.recipes_reset_review()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.is_public then
    new.review_status := 'pending';
    new.review_note := null;
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.save_recipe_copy (
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
  if src.owner_id is distinct from v_user then
    update public.recipes set saved_count = saved_count + 1 where id = src.id;
  end if;

  return v_new;
end;
$function$;

COMMENT ON FUNCTION public.save_recipe_copy(uuid) IS 'Copy a visible recipe and its ingredients into the caller''s own, recording where it came from and bumping the original''s saved count. Returns the new recipe id.';

GRANT ALL ON FUNCTION public.save_recipe_copy(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.save_recipe_copy(uuid) TO service_role;

-- HAND-ADDED to a generated migration, and the only reason this file applies at
-- all. `search_foods` carries `set "pg_trgm.similarity_threshold"`, and a
-- two-part parameter name whose extension has not been loaded in the current
-- session is an unrecognized PLACEHOLDER — which only a superuser may set. The
-- hosted `postgres` role is not one, so `supabase db push` died here with
--
--   ERROR: permission denied to set parameter "pg_trgm.similarity_threshold"
--          (SQLSTATE 42501)
--
-- and rolled the whole migration back, leaving production a version behind
-- while every check on the pull request stayed green. Nothing was wrong with
-- the SQL: `db reset` applies the baseline in the same run, and the
-- `create extension pg_trgm` at the top of it loads the library, so by the time
-- the local stack reaches this statement the parameter is real. A push applies
-- this file alone, in a session that has never touched a trigram.
--
-- Calling any pg_trgm function loads the library, which registers the parameter
-- properly and makes it settable by anybody. It has to happen in THIS session,
-- so it belongs in the migration rather than in `schemas/`, which only ever
-- shapes the shadow database. Any future migration restating this function owes
-- itself the same line.
select extensions.similarity('', '');

CREATE OR REPLACE FUNCTION public.search_foods (
  q           text,
  p_place     public.food_place DEFAULT NULL::public.food_place,
  match_limit integer           DEFAULT 50,
  p_fuzzy     boolean           DEFAULT true
)
  RETURNS SETOF public.food_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  SET "pg_trgm.similarity_threshold" TO '0.4'
  AS $function$
  -- `materialized` matters. Inlined, `search_tsquery(q)` ends up inside the
  -- full-text arm's sort key and is re-evaluated once per candidate row — 20,530
  -- times for "milk", turning a 76 ms scan into a 525 ms one. Computing both
  -- forms of the query exactly once is the whole job of this CTE.
  with params as materialized (
    select
      public.search_normalize(q) as qn,
      case
        when p_fuzzy then public.search_tsquery(q)
        else public.search_tsquery_all(q)
      end as tsq
  ),
  -- Each arm is capped before fusion, not after. A post-filter would let two
  -- hundred irrelevant candidates crowd out the handful that survive it.
  -- Every arm skips estimate, archetype and recipe rows. They are catalogue
  -- rows so that `food_logs.food_id` can reference them, not so that search can
  -- offer a guess next to a curated dish — and in the recipe case the exclusion
  -- is what keeps one user's cooking out of everybody else's results.
  exact as (
    select f.id, 1 as rank
    from public.foods f, params p
    where p.qn <> ''
      and f.name_norm = p.qn
      and not f.is_estimate and not f.is_archetype and not f.is_recipe
      and (p_place is null or f.place = p_place)
    limit 200
  ),
  -- Ranked inside the subquery and numbered outside it, rather than with one
  -- window function over the lot. A bare `order by` under a `limit` lets
  -- Postgres keep a 200-row heap; a window function makes it sort every match
  -- first, and a common word does not match a handful of rows. "chicken" alone
  -- matches tens of thousands, and full-sorting them cost 870 ms.
  fts as (
    select id, row_number() over () as rank
    from (
      select f.id
      from public.foods f, params p
      where p.tsq is not null
        and f.search_tsv @@ p.tsq
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      order by ts_rank_cd(f.search_tsv, p.tsq) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  -- `operator(extensions.%)` rather than `similarity(...) > 0.4`: only the
  -- operator form reaches the GIN trigram index, and the function form would
  -- sequentially scan the whole catalogue on every keystroke.
  --
  -- `place <> 'packaged'` is not a filter on what the user may find — it is the
  -- predicate of the partial index this arm rides, and it has to be repeated
  -- here for the planner to use it. Packaged goods are still reached by the
  -- exact and full-text arms; what they do not get is fuzzy matching. See the
  -- index comment in 20_foods.sql for why that is the right trade.
  trgm as (
    select id, row_number() over () as rank
    from (
      select f.id
      from public.foods f, params p
      where p_fuzzy
        and p.qn <> ''
        and f.place <> 'packaged'
        and f.name_norm operator(extensions.%) p.qn
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      order by extensions.similarity(f.name_norm, p.qn) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  fused as (
    select id, sum(w) as score
    from (
      select id, 3.0 / (50 + rank) as w from exact
      union all
      select id, 1.0 / (50 + rank)      from fts
      union all
      select id, 0.8 / (50 + rank)      from trgm
    ) arms
    group by id
  )
  select d.*
  from fused
  join public.food_details d on d.id = fused.id
  -- `verified` breaks ties: between a laboratory measurement and a
  -- manufacturer's label for the same thing, prefer the measurement. It is a
  -- tiebreak and not a term, so it can never outrank relevance.
  order by fused.score desc, d.verified desc, d.name
  limit greatest(1, least(coalesce(match_limit, 50), 200));
$function$;

CREATE FUNCTION public.set_recipe_public (
  p_recipe_id uuid,
  p_public    boolean
)
  RETURNS public.recipe_review
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner  uuid;
  v_status public.recipe_review;
begin
  select r.owner_id into v_owner from public.recipes r where r.id = p_recipe_id;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'recipe not found';
  end if;

  if p_public then
    update public.recipes
    set is_public = true, review_status = 'pending', review_note = null
    where id = p_recipe_id
    returning review_status into v_status;
  else
    update public.recipes
    set is_public = false
    where id = p_recipe_id
    returning review_status into v_status;
  end if;

  return v_status;
end;
$function$;

COMMENT ON FUNCTION public.set_recipe_public(uuid,boolean) IS 'Ask for a recipe to be listed in the community tab, or take it back. Always leaves the review at `pending`: approval is the review function''s to give, never the client''s. Owner-checked.';

GRANT ALL ON FUNCTION public.set_recipe_public(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_recipe_public(uuid, boolean) TO service_role;

ALTER TABLE public.foods
  ADD COLUMN is_recipe boolean DEFAULT false NOT NULL;

CREATE TRIGGER profiles_sync_recipe_author
  AFTER UPDATE OF display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sync_recipe_author();

CREATE TABLE public.recipe_ingredients (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  recipe_id          uuid                     NOT NULL,
  name               text                     NOT NULL,
  food_id            uuid,
  amount             numeric(9,2)             NOT NULL,
  unit               public.recipe_unit       DEFAULT 'g'::public.recipe_unit NOT NULL,
  kcal_per_unit      numeric(10,4)            NOT NULL,
  carbs_g_per_unit   numeric(10,4)            DEFAULT 0 NOT NULL,
  protein_g_per_unit numeric(10,4)            DEFAULT 0 NOT NULL,
  fat_g_per_unit     numeric(10,4)            DEFAULT 0 NOT NULL,
  "position"         smallint                 DEFAULT 0 NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_ingredients
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_amount_check CHECK (amount > 0::numeric AND amount <= 100000::numeric);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_carbs_g_per_unit_check CHECK (carbs_g_per_unit >= 0::numeric);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_fat_g_per_unit_check CHECK (fat_g_per_unit >= 0::numeric);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE SET NULL;

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_kcal_per_unit_check CHECK (kcal_per_unit >= 0::numeric);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_protein_g_per_unit_check CHECK (protein_g_per_unit >= 0::numeric);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredients TO anon;

GRANT ALL ON public.recipe_ingredients TO authenticated;

GRANT ALL ON public.recipe_ingredients TO service_role;

CREATE INDEX recipe_ingredients_recipe_idx ON public.recipe_ingredients (recipe_id, "position");

CREATE TRIGGER recipe_ingredients_set_updated_at
  BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER recipe_ingredients_sync_food
  AFTER INSERT OR DELETE OR UPDATE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.recipe_ingredients_after_write();

CREATE TABLE public.recipes (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  owner_id         uuid,
  food_id          uuid                     NOT NULL,
  name             text                     NOT NULL,
  photo_path       text,
  icon_set         public.icon_set,
  icon_name        text,
  servings         smallint                 DEFAULT 1 NOT NULL,
  steps            text,
  is_public        boolean                  DEFAULT false NOT NULL,
  review_status    public.recipe_review     DEFAULT 'pending'::public.recipe_review NOT NULL,
  review_note      text,
  author_name      text                     DEFAULT ''::text NOT NULL,
  share_slug       text                     NOT NULL,
  source_recipe_id uuid,
  saved_count      integer                  DEFAULT 0 NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "recipe_ingredients: delete own recipe" ON public.recipe_ingredients
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "recipe_ingredients: read with recipe" ON public.recipe_ingredients
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE (r.id = recipe_ingredients.recipe_id))));

CREATE POLICY "recipe_ingredients: update own recipe" ON public.recipe_ingredients
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "recipe_ingredients: write own recipe" ON public.recipe_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.recipes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_author_name_check CHECK (char_length(author_name) <= 60);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE RESTRICT;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_food_id_key UNIQUE (food_id);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_review_note_check CHECK (char_length(review_note) <= 500);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_saved_count_check CHECK (saved_count >= 0);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_servings_check CHECK (servings >= 1 AND servings <= 100);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_share_slug_key UNIQUE (share_slug);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_source_recipe_id_fkey FOREIGN KEY (source_recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_steps_check CHECK (char_length(steps) <= 4000);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipes TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipes TO authenticated;

GRANT UPDATE (icon_name, icon_set, name, photo_path, servings, steps) ON public.recipes TO authenticated;

GRANT ALL ON public.recipes TO service_role;

CREATE INDEX recipes_community_idx ON public.recipes (saved_count DESC, created_at DESC)
  WHERE is_public AND review_status = 'approved'::public.recipe_review;

CREATE INDEX recipes_official_idx ON public.recipes (created_at DESC)
  WHERE owner_id IS NULL;

CREATE INDEX recipes_source_idx ON public.recipes (source_recipe_id)
  WHERE source_recipe_id IS NOT NULL;

CREATE INDEX recipes_owner_idx ON public.recipes (owner_id, created_at DESC);

CREATE TRIGGER recipes_after_delete
  AFTER DELETE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_after_delete();

CREATE TRIGGER recipes_before_insert
  BEFORE INSERT ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_before_insert();

CREATE TRIGGER recipes_reset_review
  BEFORE UPDATE OF name, steps, servings ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_reset_review();

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER recipes_sync_food
  AFTER UPDATE OF name, icon_set, icon_name, servings ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_after_write();

CREATE TRIGGER recipes_sync_food_insert
  AFTER INSERT ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_after_write();

CREATE POLICY "recipes: delete own" ON public.recipes
  FOR DELETE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipes: insert own" ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipes: read own, official and approved public" ON public.recipes
  FOR SELECT
  TO authenticated
  USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (owner_id IS NULL) OR (is_public AND (review_status = 'approved'::public.recipe_review))));

CREATE POLICY "recipes: update own" ON public.recipes
  FOR UPDATE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE VIEW public.recipe_details WITH (security_invoker=on) AS SELECT r.id,
    r.owner_id,
    r.food_id,
    r.name,
    r.photo_path,
    r.icon_set,
    r.icon_name,
    r.servings,
    r.steps,
    r.is_public,
    r.review_status,
    r.review_note,
    r.author_name,
    r.share_slug,
    r.source_recipe_id,
    r.saved_count,
    r.created_at,
    r.updated_at,
    (r.owner_id IS NULL) AS is_official,
    COALESCE((r.owner_id = ( SELECT auth.uid() AS uid)), false) AS is_mine,
    COALESCE(t.ingredient_count, 0) AS ingredient_count,
    (COALESCE(t.kcal, (0)::numeric))::integer AS total_kcal,
    COALESCE(t.carbs_g, (0)::numeric) AS total_carbs_g,
    COALESCE(t.protein_g, (0)::numeric) AS total_protein_g,
    COALESCE(t.fat_g, (0)::numeric) AS total_fat_g,
    (round((COALESCE(t.kcal, (0)::numeric) / (GREATEST((r.servings)::integer, 1))::numeric)))::integer AS serving_kcal,
    round((COALESCE(t.carbs_g, (0)::numeric) / (GREATEST((r.servings)::integer, 1))::numeric), 1) AS serving_carbs_g,
    round((COALESCE(t.protein_g, (0)::numeric) / (GREATEST((r.servings)::integer, 1))::numeric), 1) AS serving_protein_g,
    round((COALESCE(t.fat_g, (0)::numeric) / (GREATEST((r.servings)::integer, 1))::numeric), 1) AS serving_fat_g,
    d.id AS default_serving_id
   FROM ((public.recipes r
     LEFT JOIN public.food_servings d ON (((d.food_id = r.food_id) AND d.is_default)))
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS ingredient_count,
            sum((i.kcal_per_unit * i.amount)) AS kcal,
            sum((i.carbs_g_per_unit * i.amount)) AS carbs_g,
            sum((i.protein_g_per_unit * i.amount)) AS protein_g,
            sum((i.fat_g_per_unit * i.amount)) AS fat_g
           FROM public.recipe_ingredients i
          WHERE (i.recipe_id = r.id)) t ON (true));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_details TO service_role;

CREATE VIEW public.recipe_ingredient_details WITH (security_invoker=on) AS SELECT id,
    recipe_id,
    food_id,
    "position",
    name,
    amount,
    unit,
    kcal_per_unit,
    carbs_g_per_unit,
    protein_g_per_unit,
    fat_g_per_unit,
    (round((kcal_per_unit * amount)))::integer AS kcal,
    round((carbs_g_per_unit * amount), 1) AS carbs_g,
    round((protein_g_per_unit * amount), 1) AS protein_g,
    round((fat_g_per_unit * amount), 1) AS fat_g
   FROM public.recipe_ingredients i;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.recipe_ingredient_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_ingredient_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.recipe_ingredient_details TO service_role;

CREATE OR REPLACE VIEW public.user_food_stats WITH (security_invoker=on) AS SELECT e.user_id,
    e.food_id,
    (count(*))::integer AS times_logged,
    max(e.logged_at) AS last_logged_at
   FROM (public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
  WHERE ((NOT f.is_estimate) AND (NOT f.is_archetype) AND (NOT f.is_recipe))
  GROUP BY e.user_id, e.food_id;
-- `db diff` does not see grant/revoke deltas on functions — see the note in
-- CLAUDE.md — so these are hand-written. Without them the four ship executable
-- by PUBLIC, and two of them are exactly the ones that must not be:
-- `set_recipe_public` is the door onto the community tab, and
-- `recipe_mark_for_review` is what sends an edited recipe back through it.
REVOKE ALL ON FUNCTION public.recipe_sync_food(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recipe_mark_for_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_recipe_copy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_recipe_public(uuid, boolean) FROM PUBLIC;
