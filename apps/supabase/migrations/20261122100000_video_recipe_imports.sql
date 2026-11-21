-- Importing a recipe from a cooking video (README: "Importing a recipe from a
-- video").
--
-- `recipe_imports` caches one model answer per video, `recipe_import_usage` is
-- the monthly allowance (five free, an unprinted ceiling on Pro),
-- `recipe_import_runs` the hourly ceiling on uncached model runs, and
-- `import_recipe_for` makes the recipe and claims the allowance in one
-- transaction. `recipes` gains the video credit (`import_platform`,
-- `import_author`, `import_url`) and `import_id`, all nullable and outside the
-- client grants, so a build already in a store neither writes nor needs them.
-- The kept-recipe ceiling no longer counts imported recipes.
--
-- Hand-arranged from `pnpm db:diff`, which dropped and recreated
-- `recipe_details` and `get_shared_recipe`, losing the function's grants and
-- comment. The view only gains columns at its end, which `create or replace`
-- allows, and the function is replaced in place, so both keep their grants. The
-- diff carries no revokes either, so the new functions' and tables' grants are
-- restated at the foot, as `98_client_table_privileges.sql` and the schema file
-- state them.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.claim_recipe_import_run (
  p_user uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit  integer     := public.recipe_import_hourly_runs();
  v_window timestamptz := date_trunc('hour', (now() at time zone 'utc')) at time zone 'utc';
  v_used   integer;
begin
  insert into public.recipe_import_runs as u (user_id, window_start, runs)
  values (p_user, v_window, 1)
  on conflict (user_id, window_start) do update
     set runs = u.runs + 1
   where u.runs + 1 <= v_limit
  returning u.runs into v_used;

  return v_used is not null;
end;
$function$;

GRANT ALL ON FUNCTION public.claim_recipe_import_run(uuid) TO service_role;

CREATE FUNCTION public.free_monthly_imports()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 5;
$function$;

GRANT ALL ON FUNCTION public.free_monthly_imports() TO authenticated;

GRANT ALL ON FUNCTION public.free_monthly_imports() TO service_role;

CREATE FUNCTION public.import_recipe_for (
  p_user       uuid,
  p_import     uuid,
  p_photo_path text DEFAULT NULL::text
)
  RETURNS TABLE (
    recipe_id           uuid,
    existing            boolean,
    allowed             boolean,
    used                integer,
    monthly_limit       integer,
    community_recipe_id uuid,
    community_review    public.recipe_review,
    is_community        boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  imp         public.recipe_imports;
  d           jsonb;
  v_limit     integer := public.recipe_import_monthly_limit(p_user);
  v_month     date    := date_trunc('month', public.local_today(p_user))::date;
  v_used      integer;
  v_existing  uuid;
  v_new       uuid;
  v_community uuid;
  v_review    public.recipe_review;
begin
  select * into imp
    from public.recipe_imports i
   where i.id = p_import
     for update;

  if imp.id is null or imp.status <> 'recipe' or imp.draft is null then
    raise exception 'import not found';
  end if;

  if p_photo_path is not null and p_photo_path not like 'meals/' || p_user::text || '/%' then
    raise exception 'photo is not this user''s';
  end if;

  select r.id into v_existing
    from public.recipes r
   where r.owner_id = p_user and r.import_id = p_import
   order by r.created_at
   limit 1;

  if v_existing is not null then
    select u.imports into v_used
      from public.recipe_import_usage u
     where u.user_id = p_user and u.month = v_month;
    select r.id, r.review_status into v_community, v_review
      from public.recipes r where r.id = imp.community_recipe_id;
    return query select v_existing, true, true, coalesce(v_used, 0), v_limit,
      v_community, v_review, v_community is not distinct from v_existing;
    return;
  end if;

  insert into public.recipe_import_usage as u (user_id, month, imports)
  values (p_user, v_month, 1)
  on conflict (user_id, month) do update
     set imports = u.imports + 1
   where u.imports + 1 <= v_limit
  returning u.imports into v_used;

  if v_used is null then
    select u.imports into v_used
      from public.recipe_import_usage u
     where u.user_id = p_user and u.month = v_month;
    return query select null::uuid, false, false, coalesce(v_used, 0), v_limit,
      null::uuid, null::public.recipe_review, false;
    return;
  end if;

  -- Still on the shelf, or on its way there? An unpublished, deleted or
  -- rejected original stops being the community recipe, and this import takes
  -- its place: a rejection is a verdict on what its owner made of it (an edit
  -- turned into an advert), not on the video, and everybody after would
  -- otherwise be counted as saving a recipe none of them can see.
  select r.id, r.review_status into v_community, v_review
    from public.recipes r
   where r.id = imp.community_recipe_id
     and r.is_public
     and r.review_status <> 'rejected';

  d := imp.draft;

  insert into public.recipes (
    owner_id, name, servings, steps, icon_set, icon_name, photo_path,
    prep_minutes, cook_minutes, tags, source_recipe_id,
    import_id, import_platform, import_author, import_url
  )
  values (
    p_user,
    d ->> 'name',
    coalesce((d ->> 'servings')::smallint, 1),
    nullif(d ->> 'steps', ''),
    case when d ->> 'icon_name' is null then null else (d ->> 'icon_set')::public.icon_set end,
    case when d ->> 'icon_set' is null then null else d ->> 'icon_name' end,
    p_photo_path,
    (d ->> 'prep_minutes')::smallint,
    (d ->> 'cook_minutes')::smallint,
    coalesce(
      array(select pg_catalog.jsonb_array_elements_text(coalesce(d -> 'tags', '[]'::jsonb))),
      '{}'::text[]
    ),
    v_community,
    imp.id,
    imp.platform,
    imp.author_handle,
    imp.canonical_url
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, amount, unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new,
    i.value ->> 'name',
    (i.value ->> 'amount')::numeric,
    (i.value ->> 'unit')::public.recipe_unit,
    coalesce((i.value ->> 'kcal_per_unit')::numeric, 0),
    coalesce((i.value ->> 'carbs_g_per_unit')::numeric, 0),
    coalesce((i.value ->> 'protein_g_per_unit')::numeric, 0),
    coalesce((i.value ->> 'fat_g_per_unit')::numeric, 0),
    (i.ordinality - 1)::smallint
  from pg_catalog.jsonb_array_elements(coalesce(d -> 'ingredients', '[]'::jsonb))
       with ordinality as i (value, ordinality);

  if v_community is not null then
    -- A save of the community recipe, counted once per person, exactly as
    -- `save_recipe_copy` counts one.
    insert into public.recipe_saves (recipe_id, user_id)
    values (v_community, p_user)
    on conflict do nothing;

    if found then
      update public.recipes set saved_count = saved_count + 1 where id = v_community;
    end if;
  else
    -- The first recipe from this video goes to the community, pending like
    -- every publish: the caller runs the review, and until it approves, the
    -- shelf does not show it.
    update public.recipes
       set is_public = true, review_status = 'pending', review_note = null
     where id = v_new;
    update public.recipe_imports set community_recipe_id = v_new where id = imp.id;
    v_community := v_new;
    v_review := 'pending';
  end if;

  update public.recipe_imports set imports = imports + 1 where id = imp.id;

  return query select v_new, false, true, v_used, v_limit,
    v_community, v_review, v_community = v_new;
end;
$function$;

COMMENT ON FUNCTION public.import_recipe_for(uuid,uuid,text) IS 'Make a recipe for p_user out of a cached video import, claiming one of the month''s imports in the same transaction. The first importer''s recipe is published (pending review); later importers get a private recipe counted as a save of it. Server only.';

GRANT ALL ON FUNCTION public.import_recipe_for(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.pro_monthly_imports()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 200;
$function$;

GRANT ALL ON FUNCTION public.pro_monthly_imports() TO service_role;

CREATE FUNCTION public.recipe_import_allowance (
  p_user uuid
)
  RETURNS TABLE (
    used          integer,
    monthly_limit integer,
    remaining     integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    coalesce(u.imports, 0),
    public.recipe_import_monthly_limit(p_user),
    greatest(public.recipe_import_monthly_limit(p_user) - coalesce(u.imports, 0), 0)
  from (select 1) as one
  left join public.recipe_import_usage u
    on u.user_id = p_user
   and u.month = date_trunc('month', public.local_today(p_user))::date;
$function$;

GRANT ALL ON FUNCTION public.recipe_import_allowance(uuid) TO service_role;

CREATE FUNCTION public.recipe_import_hourly_runs()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 20;
$function$;

GRANT ALL ON FUNCTION public.recipe_import_hourly_runs() TO service_role;

CREATE FUNCTION public.recipe_import_monthly_limit (
  p_user uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when public.is_entitled(p_user) then public.pro_monthly_imports()
    else public.free_monthly_imports()
  end;
$function$;

GRANT ALL ON FUNCTION public.recipe_import_monthly_limit(uuid) TO service_role;

CREATE FUNCTION public.recipe_import_usage_this_month()
  RETURNS TABLE (
    used          integer,
    monthly_limit integer,
    remaining     integer,
    entitled      boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select a.used, a.monthly_limit, a.remaining, public.is_entitled((select auth.uid()))
  from public.recipe_import_allowance((select auth.uid())) a
  where (select auth.uid()) is not null;
$function$;

GRANT ALL ON FUNCTION public.recipe_import_usage_this_month() TO authenticated;

GRANT ALL ON FUNCTION public.recipe_import_usage_this_month() TO service_role;

CREATE OR REPLACE FUNCTION public.recipes_enforce_free_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if public.is_entitled(new.owner_id) then
    return new;
  end if;

  -- A recipe imported from a video is metered by the import allowance
  -- instead (claimed in `import_recipe_for`, five a month), and neither counts against
  -- the other: a free account told it can import five videos a month and then
  -- refused the fourth because it keeps three recipes would have been sold
  -- something the database does not do. Only the server can set `import_id`.
  if new.import_id is not null then
    return new;
  end if;

  if (
    select pg_catalog.count(*)
      from public.recipes r
     where r.owner_id = new.owner_id
       and r.import_id is null
  ) >= public.free_recipe_limit() then
    raise exception 'recipe_limit_reached'
      using errcode = 'P0001',
            hint = 'A free account may keep ' || public.free_recipe_limit()
                   || ' recipes. Pro removes the limit.';
  end if;

  return new;
end;
$function$;

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
  -- times and meal tags, and the video credit, which belongs to the dish; the
  -- source link and the star stay with their owner. `import_id` does not: a
  -- saved copy is a recipe kept, not a video imported, and counts as one.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id,
    prep_minutes, cook_minutes, tags,
    import_platform, import_author, import_url
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags,
    src.import_platform, src.import_author, src.import_url
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
    prep_minutes, cook_minutes, tags,
    import_platform, import_author, import_url
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags,
    src.import_platform, src.import_author, src.import_url
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

CREATE TABLE public.recipe_import_runs (
  user_id      uuid                     NOT NULL,
  window_start timestamp with time zone NOT NULL,
  runs         integer                  DEFAULT 0 NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_import_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_import_runs
  ADD CONSTRAINT recipe_import_runs_pkey PRIMARY KEY (user_id, window_start);

ALTER TABLE public.recipe_import_runs
  ADD CONSTRAINT recipe_import_runs_runs_check CHECK (runs >= 0);

ALTER TABLE public.recipe_import_runs
  ADD CONSTRAINT recipe_import_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.recipe_import_runs TO service_role;

CREATE TRIGGER recipe_import_runs_set_updated_at
  BEFORE UPDATE ON public.recipe_import_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Server only" ON public.recipe_import_runs
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE TABLE public.recipe_import_usage (
  user_id    uuid                     NOT NULL,
  month      date                     NOT NULL,
  imports    integer                  DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_import_usage
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_import_usage
  ADD CONSTRAINT recipe_import_usage_imports_check CHECK (imports >= 0);

ALTER TABLE public.recipe_import_usage
  ADD CONSTRAINT recipe_import_usage_month_check CHECK (EXTRACT(day FROM month) = 1::numeric);

ALTER TABLE public.recipe_import_usage
  ADD CONSTRAINT recipe_import_usage_pkey PRIMARY KEY (user_id, month);

ALTER TABLE public.recipe_import_usage
  ADD CONSTRAINT recipe_import_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON public.recipe_import_usage TO authenticated;

GRANT ALL ON public.recipe_import_usage TO service_role;

CREATE TRIGGER recipe_import_usage_set_updated_at
  BEFORE UPDATE ON public.recipe_import_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "recipe_import_usage: read own" ON public.recipe_import_usage
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.recipe_imports (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  platform            text                     NOT NULL,
  video_id            text                     NOT NULL,
  canonical_url       text                     NOT NULL,
  status              text                     NOT NULL,
  draft               jsonb,
  reason              text,
  author_handle       text,
  title               text,
  caption             text,
  analysed_from       text                     NOT NULL,
  photo_key           text,
  community_recipe_id uuid,
  created_by          uuid,
  imports             integer                  DEFAULT 0 NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.recipe_imports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_analysed_from_check CHECK (analysed_from = ANY (ARRAY['video'::text, 'caption'::text]));

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_author_handle_check CHECK (char_length(author_handle) <= 80);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_canonical_url_check CHECK (char_length(canonical_url) <= 500 AND canonical_url ~* '^https://[^[:space:]]+$'::text);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_caption_check CHECK (char_length(caption) <= 5000);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_community_recipe_id_fkey FOREIGN KEY (community_recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_draft_present CHECK ((status = 'recipe'::text) = (draft IS NOT NULL));

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_imports_check CHECK (imports >= 0);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_photo_key_check CHECK (photo_key ~ '^imports/[A-Za-z0-9_.-]+$'::text);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_pkey PRIMARY KEY (id);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_platform_check
    CHECK (platform = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'youtube'::text, 'x'::text, 'threads'::text, 'facebook'::text, 'rednote'::text]));

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_reason_check CHECK (char_length(reason) <= 500);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_status_check CHECK (status = ANY (ARRAY['recipe'::text, 'not_recipe'::text]));

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_title_check CHECK (char_length(title) <= 300);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_video_id_check CHECK (video_id ~ '^[A-Za-z0-9_.:-]{1,200}$'::text);

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_video_key UNIQUE (platform, video_id);

GRANT ALL ON public.recipe_imports TO service_role;

CREATE INDEX recipe_imports_community_idx ON public.recipe_imports (community_recipe_id)
  WHERE community_recipe_id IS NOT NULL;

CREATE INDEX recipe_imports_created_by_idx ON public.recipe_imports (created_by)
  WHERE created_by IS NOT NULL;

CREATE TRIGGER recipe_imports_set_updated_at
  BEFORE UPDATE ON public.recipe_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Server only" ON public.recipe_imports
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.recipes
  ADD COLUMN import_platform text;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_import_platform_check
    CHECK (import_platform = ANY (ARRAY['instagram'::text, 'tiktok'::text, 'youtube'::text, 'x'::text, 'threads'::text, 'facebook'::text, 'rednote'::text]));

ALTER TABLE public.recipes
  ADD COLUMN import_author text;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_import_author_check CHECK (char_length(import_author) <= 80);

ALTER TABLE public.recipes
  ADD COLUMN import_url text;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_import_url_check CHECK (char_length(import_url) <= 500 AND import_url ~* '^https://[^[:space:]]+$'::text);

ALTER TABLE public.recipes
  ADD COLUMN import_id uuid;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.recipe_imports(id) ON DELETE SET NULL;

CREATE INDEX recipes_import_idx ON public.recipes (import_id, owner_id)
  WHERE import_id IS NOT NULL;

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
    COALESCE(p.is_favourite, false) AS is_favourite,
    r.import_platform,
    r.import_author,
    r.import_url
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
    d.is_mine and d.is_favourite as is_favourite,
    d.import_platform,
    d.import_author,
    d.import_url
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

-- Grants the diff does not carry. Supabase's default privileges give every new
-- function and table to anon and authenticated, so each is narrowed to what
-- `25_recipe_imports.sql` states.
REVOKE EXECUTE ON FUNCTION public.free_monthly_imports() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.pro_monthly_imports() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipe_import_monthly_limit(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipe_import_usage_this_month() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.recipe_import_hourly_runs() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_recipe_import_run(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.import_recipe_for(uuid, uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipe_import_allowance(uuid) FROM public, anon, authenticated;

REVOKE ALL ON public.recipe_imports FROM public, anon, authenticated;
REVOKE ALL ON public.recipe_import_runs FROM public, anon, authenticated;
REVOKE ALL ON public.recipe_import_usage FROM public, anon, authenticated;
GRANT SELECT ON public.recipe_import_usage TO authenticated;
