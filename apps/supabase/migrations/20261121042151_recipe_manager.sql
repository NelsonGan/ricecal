-- The Recipes tab: what a cook needs on a recipe beyond what goes in it.
--
-- `recipes` gains prep and cook minutes and meal tags from a fixed set of keys.
-- The cook's source link and favourite star go in `recipe_private`, a table
-- whose read policy is owner-only, because `recipes` is readable by everybody on
-- an approved community row and a column there cannot be hidden from them.
-- Everything is nullable or defaulted, so a build already in a store neither
-- writes nor needs any of it, and its updates leave the new columns alone.
--
-- Hand-arranged from `pnpm db:diff`, which dropped and recreated
-- `recipe_details` and, with it, `get_shared_recipe` (which returns its rows). A
-- recreated function comes back executable by PUBLIC and without its comment,
-- because the diff does not carry grants. The view only gains columns at its
-- end instead, which `create or replace` allows, and the function is replaced
-- in place, so both keep their grants. The client-privilege revoke that
-- `98_client_table_privileges.sql` applies to every table is restated for the
-- new one at the foot, since that file ran before this table existed.

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
  -- The illustration copies, because a drawing belongs to nobody. So do the
  -- times and meal tags; the source link and the star stay with their owner.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id,
    prep_minutes, cook_minutes, tags
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, food_id, amount, unit, display_unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new, i.name, i.food_id, i.amount, i.unit, i.display_unit,
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

CREATE OR REPLACE FUNCTION public.save_shared_recipe_copy (
  p_share_slug text
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
  where r.share_slug = p_share_slug
    and (
      r.owner_id = v_user
      or r.owner_id is null
      or (
        not exists (
          select 1
          from public.blocked_authors b
          where b.user_id = v_user
            and b.author_id = r.owner_id
        )
        and not exists (
          select 1
          from public.recipe_reports p
          where p.recipe_id = r.id
            and p.reporter_id = v_user
        )
      )
    );

  if src.id is null then
    raise exception 'recipe not found';
  end if;

  -- Photographs stay with their owner. See save_recipe_copy for why the icon
  -- can copy and an R2 object key cannot.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id,
    prep_minutes, cook_minutes, tags
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, food_id, amount, unit, display_unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new, i.name, i.food_id, i.amount, i.unit, i.display_unit,
    i.kcal_per_unit, i.carbs_g_per_unit, i.protein_g_per_unit, i.fat_g_per_unit,
    i.position
  from public.recipe_ingredients i
  where i.recipe_id = src.id;

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

CREATE TABLE public.recipe_private (
  recipe_id    uuid                     NOT NULL,
  owner_id     uuid                     NOT NULL,
  source_url   text,
  is_favourite boolean                  DEFAULT false NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_private
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_private
  ADD CONSTRAINT recipe_private_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recipe_private
  ADD CONSTRAINT recipe_private_pkey PRIMARY KEY (recipe_id);

ALTER TABLE public.recipe_private
  ADD CONSTRAINT recipe_private_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE public.recipe_private
  ADD CONSTRAINT recipe_private_source_url_check CHECK (char_length(source_url) <= 2000 AND source_url ~* '^https?://[^[:space:]]+$'::text);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.recipe_private TO authenticated;

GRANT ALL ON public.recipe_private TO service_role;

CREATE INDEX recipe_private_owner_idx ON public.recipe_private (owner_id);

CREATE TRIGGER recipe_private_set_updated_at
  BEFORE UPDATE ON public.recipe_private
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "recipe_private: delete own" ON public.recipe_private
  FOR DELETE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipe_private: read own" ON public.recipe_private
  FOR SELECT
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "recipe_private: update own" ON public.recipe_private
  FOR UPDATE
  TO authenticated
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_private.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "recipe_private: write own recipe" ON public.recipe_private
  FOR INSERT
  TO authenticated
  WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.recipes r
  WHERE ((r.id = recipe_private.recipe_id) AND (r.owner_id = ( SELECT auth.uid() AS uid)))))));

ALTER TABLE public.recipes
  ADD COLUMN prep_minutes smallint;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_prep_minutes_check CHECK (prep_minutes >= 0 AND prep_minutes <= 2880);

ALTER TABLE public.recipes
  ADD COLUMN cook_minutes smallint;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_cook_minutes_check CHECK (cook_minutes >= 0 AND cook_minutes <= 2880);

ALTER TABLE public.recipes
  ADD COLUMN tags text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_tags_check CHECK (tags <@ ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'dessert'::text, 'drink'::text]);

REVOKE INSERT (icon_name, icon_set, name, owner_id, photo_path, servings, steps) ON public.recipes FROM authenticated;

REVOKE UPDATE (icon_name, icon_set, name, photo_path, servings, steps) ON public.recipes FROM authenticated;

GRANT INSERT (cook_minutes, icon_name, icon_set, name, owner_id, photo_path, prep_minutes, servings, steps, tags) ON public.recipes TO authenticated;

GRANT UPDATE (cook_minutes, icon_name, icon_set, name, photo_path, prep_minutes, servings, steps, tags) ON public.recipes TO authenticated;

CREATE OR REPLACE VIEW public.recipe_details WITH (security_invoker=on) AS SELECT r.id,
    r.owner_id,
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
    r.prep_minutes,
    r.cook_minutes,
    r.tags,
    p.source_url,
    COALESCE(p.is_favourite, false) AS is_favourite
   FROM ((public.recipes r
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS ingredient_count,
            sum((i.kcal_per_unit * i.amount)) AS kcal,
            sum((i.carbs_g_per_unit * i.amount)) AS carbs_g,
            sum((i.protein_g_per_unit * i.amount)) AS protein_g,
            sum((i.fat_g_per_unit * i.amount)) AS fat_g
           FROM public.recipe_ingredients i
          WHERE (i.recipe_id = r.id)) t ON (true))
     LEFT JOIN public.recipe_private p ON ((p.recipe_id = r.id)));

CREATE OR REPLACE FUNCTION public.get_shared_recipe (
  p_share_slug text
)
  RETURNS SETOF public.recipe_details
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    d.id,
    d.owner_id,
    d.name,
    d.photo_path,
    d.icon_set,
    d.icon_name,
    d.servings,
    d.steps,
    d.is_public,
    d.review_status,
    null::text as review_note,
    d.author_name,
    d.share_slug,
    d.source_recipe_id,
    d.saved_count,
    d.created_at,
    d.updated_at,
    d.is_official,
    d.is_mine,
    d.ingredient_count,
    d.total_kcal,
    d.total_carbs_g,
    d.total_protein_g,
    d.total_fat_g,
    d.serving_kcal,
    d.serving_carbs_g,
    d.serving_protein_g,
    d.serving_fat_g,
    d.prep_minutes,
    d.cook_minutes,
    d.tags,
    -- Security definer reads past `recipe_private`'s policy, so the owner-only
    -- rule is restated here: a link's holder gets neither the cook's source
    -- nor their star.
    case when d.is_mine then d.source_url end as source_url,
    d.is_mine and d.is_favourite as is_favourite
  from public.recipe_details d
  where (select auth.uid()) is not null
    and d.share_slug = p_share_slug
    and (
      d.owner_id = (select auth.uid())
      or d.owner_id is null
      or (
        not exists (
          select 1
          from public.blocked_authors b
          where b.user_id = (select auth.uid())
            and b.author_id = d.owner_id
        )
        and not exists (
          select 1
          from public.recipe_reports r
          where r.recipe_id = d.id
            and r.reporter_id = (select auth.uid())
        )
      )
    )
  limit 1;
$function$;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.recipe_private
  FROM public, anon, authenticated;
