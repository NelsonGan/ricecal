-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.claim_recipe_review(IN p_user uuid);

DROP FUNCTION public.recipe_mark_for_review(p_recipe_id uuid);

DROP FUNCTION public.recipe_review_hourly_limit();

DROP TRIGGER recipe_ingredients_after_write ON public.recipe_ingredients;

DROP FUNCTION public.recipe_ingredients_after_write();

DROP TRIGGER recipe_review_usage_set_updated_at ON public.recipe_review_usage;

DROP TRIGGER recipes_reset_review ON public.recipes;

DROP FUNCTION public.recipes_reset_review();

DROP POLICY "recipe_review_usage: read own" ON public.recipe_review_usage;

DROP TABLE public.recipe_review_usage;

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

COMMENT ON FUNCTION public.import_recipe_for(uuid,uuid,text) IS 'Make a recipe for p_user out of a cached video import, claiming one of the month''s imports in the same transaction. The first importer''s recipe is published; later importers get a private recipe counted as a save of it. Server only.';

CREATE OR REPLACE FUNCTION public.set_recipe_public (
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
    set is_public = true, review_status = 'approved', review_note = null
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

COMMENT ON FUNCTION public.set_recipe_public(uuid,boolean) IS 'List a recipe in the community tab, or take it back. Publishing writes `approved` at once; there is no review. Owner-checked.';

-- Data the diff cannot carry. Written by hand.
--
-- A public recipe still at `pending` was waiting for the review that no longer
-- exists, so it is listed now. One parked there by three reports is private
-- (`recipe_reports_after_insert` unpublishes it), so `is_public` leaves it out.
UPDATE public.recipes
   SET review_status = 'approved', review_note = null
 WHERE is_public AND review_status = 'pending';

-- A public recipe the old reviewer rejected is not listed and nothing will
-- list it now. It is unpublished instead, so its owner sees the switch off and
-- publishing it again lists it, rather than a switch that says public over a
-- recipe nobody can find.
UPDATE public.recipes
   SET is_public = false
 WHERE is_public AND review_status = 'rejected';
