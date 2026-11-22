-- Imported recipes in the reader's own language (README: "Importing a recipe
-- from a video").
--
-- `recipe_imports` and `recipes` gain `translations`, the draft's name, method
-- and ingredient names in other app languages, keyed by language code. The
-- recipe's own columns stay English, which is what every reader falls back on.
-- `store_recipe_import_translation` keeps the first translation into each
-- language and hands it to the video's community recipe and the caller's own;
-- `import_recipe_for` and both copy functions carry it; and
-- `recipes_drop_stale_translations` drops the half an owner has rewritten.
-- The column defaults to `{}` and is in neither client grant, so a build
-- already in a store neither writes nor needs it.
--
-- Hand-arranged from `pnpm db:diff`, which dropped and recreated
-- `recipe_details` and `get_shared_recipe`, losing the function's grants and
-- comment. The view only gains a column at its end, which `create or replace`
-- allows, and the function is replaced in place, so both keep their grants.
-- The new functions' revokes are restated at the foot.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.import_recipe_for (
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
    import_id, import_platform, import_author, import_url, translations
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
    imp.canonical_url,
    imp.translations
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
    -- The first recipe from this video goes to the community, listed at once
    -- like every publish.
    update public.recipes
       set is_public = true, review_status = 'approved', review_note = null
     where id = v_new;
    update public.recipe_imports set community_recipe_id = v_new where id = imp.id;
    v_community := v_new;
    v_review := 'approved';
  end if;

  update public.recipe_imports set imports = imports + 1 where id = imp.id;

  return query select v_new, false, true, v_used, v_limit,
    v_community, v_review, v_community = v_new;
end;
$function$;

CREATE FUNCTION public.recipes_drop_stale_translations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_stale text[] := '{}';
begin
  if new.translations is distinct from old.translations or new.translations = '{}'::jsonb then
    return new;
  end if;
  if new.name is distinct from old.name then
    v_stale := v_stale || 'name'::text;
  end if;
  if new.steps is distinct from old.steps then
    v_stale := v_stale || 'steps'::text;
  end if;
  select coalesce(pg_catalog.jsonb_object_agg(t.key, t.value - v_stale), '{}'::jsonb)
    into new.translations
    from pg_catalog.jsonb_each(new.translations) as t;
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
  -- times and meal tags, the video credit, which belongs to the dish, and its
  -- translations, which are of the same words; the
  -- source link and the star stay with their owner. `import_id` does not: a
  -- saved copy is a recipe kept, not a video imported, and counts as one.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id,
    prep_minutes, cook_minutes, tags,
    import_platform, import_author, import_url, translations
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags,
    src.import_platform, src.import_author, src.import_url, src.translations
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
    import_platform, import_author, import_url, translations
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id,
    src.prep_minutes, src.cook_minutes, src.tags,
    src.import_platform, src.import_author, src.import_url, src.translations
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

CREATE FUNCTION public.store_recipe_import_translation (
  p_import      uuid,
  p_language    text,
  p_translation jsonb,
  p_user        uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  imp public.recipe_imports;
begin
  if p_language is null or p_language = 'en'
     or p_language !~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?$' then
    raise exception 'unsupported language';
  end if;
  if p_translation is null or pg_catalog.jsonb_typeof(p_translation) <> 'object' then
    raise exception 'translation is not an object';
  end if;

  update public.recipe_imports i
     set translations = i.translations || pg_catalog.jsonb_build_object(p_language, p_translation)
   where i.id = p_import
     and i.status = 'recipe'
     and not (i.translations ? p_language)
  returning * into imp;

  -- Somebody else's translation into this language got there first: theirs is
  -- the one handed on.
  if imp.id is null then
    select * into imp from public.recipe_imports i where i.id = p_import;
  end if;
  if imp.id is null or imp.draft is null or not (imp.translations ? p_language) then
    return;
  end if;

  update public.recipes r
     set translations = r.translations || pg_catalog.jsonb_build_object(
       p_language,
       (imp.translations -> p_language) - pg_catalog.array_remove(array[
         case when r.name is distinct from imp.draft ->> 'name' then 'name' end,
         case when r.steps is distinct from nullif(imp.draft ->> 'steps', '') then 'steps' end
       ], null)
     )
   where r.import_id = p_import
     and (r.id = imp.community_recipe_id or r.owner_id = p_user)
     and not (r.translations ? p_language);
end;
$function$;

COMMENT ON FUNCTION public.store_recipe_import_translation(uuid,text,jsonb,uuid) IS 'Keep the first translation of a cached video import into one language, and copy the one that stands onto the video''s community recipe and the caller''s own recipe from it. Server only.';

GRANT ALL ON FUNCTION public.store_recipe_import_translation(uuid, text, jsonb, uuid) TO service_role;

ALTER TABLE public.recipe_imports
  ADD COLUMN translations jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE public.recipe_imports
  ADD CONSTRAINT recipe_imports_translations_check CHECK (jsonb_typeof(translations) = 'object'::text AND octet_length(translations::text) <= 200000);

ALTER TABLE public.recipes
  ADD COLUMN translations jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_translations_check CHECK (jsonb_typeof(translations) = 'object'::text AND octet_length(translations::text) <= 200000);

CREATE TRIGGER recipes_drop_stale_translations
  BEFORE UPDATE OF name, steps ON public.recipes
  FOR EACH ROW
  WHEN (old.name IS DISTINCT FROM new.name OR old.steps IS DISTINCT FROM new.steps)
  EXECUTE FUNCTION public.recipes_drop_stale_translations();

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
    r.import_url,
    r.translations
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
    d.import_url,
    d.translations
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
-- function to anon and authenticated, so each is narrowed to what the schema
-- files state.
REVOKE EXECUTE ON FUNCTION public.recipes_drop_stale_translations() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_recipe_import_translation(uuid, text, jsonb, uuid) FROM public, anon, authenticated;
