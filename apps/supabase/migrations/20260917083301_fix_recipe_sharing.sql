-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.get_shared_recipe_ingredients (
  p_share_slug text
)
  RETURNS SETOF public.recipe_ingredient_details
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select i.*
  from public.recipe_ingredient_details i
  join public.recipes r on r.id = i.recipe_id
  where (select auth.uid()) is not null
    and r.share_slug = p_share_slug
    and (
      r.owner_id = (select auth.uid())
      or r.owner_id is null
      or (
        not exists (
          select 1
          from public.blocked_authors b
          where b.user_id = (select auth.uid())
            and b.author_id = r.owner_id
        )
        and not exists (
          select 1
          from public.recipe_reports p
          where p.recipe_id = r.id
            and p.reporter_id = (select auth.uid())
        )
      )
    )
  order by i.position;
$function$;

COMMENT ON FUNCTION public.get_shared_recipe_ingredients(text) IS 'Read the ingredients belonging to the one recipe named by a private share link, under the same signed-in, report and block rules as get_shared_recipe.';

REVOKE ALL ON FUNCTION public.get_shared_recipe_ingredients(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_shared_recipe_ingredients(text) FROM anon;

GRANT ALL ON FUNCTION public.get_shared_recipe_ingredients(text) TO authenticated;

GRANT ALL ON FUNCTION public.get_shared_recipe_ingredients(text) TO service_role;

CREATE FUNCTION public.get_shared_recipe (
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
    d.serving_fat_g
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

COMMENT ON FUNCTION public.get_shared_recipe(text) IS 'Read the one recipe named by a private share link. The slug is the bearer credential; the caller must still be signed in, and their reports and blocked cooks remain hidden.';

REVOKE ALL ON FUNCTION public.get_shared_recipe(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_shared_recipe(text) FROM anon;

GRANT ALL ON FUNCTION public.get_shared_recipe(text) TO authenticated;

GRANT ALL ON FUNCTION public.get_shared_recipe(text) TO service_role;

CREATE OR REPLACE FUNCTION public.recipes_before_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- The client does not get to choose a bearer credential. Besides protecting
  -- honest callers from weak values, this closes the direct PostgREST insert
  -- path to somebody deliberately minting a guessable link.
  new.share_slug := pg_catalog.replace(
    pg_catalog.gen_random_uuid()::text, '-', ''
  );

  new.author_name := coalesce(
    (select p.display_name from public.profiles p where p.id = new.owner_id),
    ''
  );

  return new;
end;
$function$;

-- Hand-written data migration: the old links never resolved, and their short,
-- name-bearing values are not safe credentials for the feature that now does.
-- Rotating them once gives every existing recipe the same opaque token newly
-- inserted recipes receive. A re-run leaves already-rotated rows alone.
UPDATE public.recipes
SET share_slug = pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
WHERE share_slug !~ '^[0-9a-f]{32}$';

CREATE FUNCTION public.save_shared_recipe_copy (
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

COMMENT ON FUNCTION public.save_shared_recipe_copy(text) IS 'Copy the recipe named by a private share link into the signed-in caller''s own foods. The slug is the bearer credential; reports and blocked cooks remain hidden.';

REVOKE ALL ON FUNCTION public.save_shared_recipe_copy(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.save_shared_recipe_copy(text) FROM anon;

GRANT ALL ON FUNCTION public.save_shared_recipe_copy(text) TO authenticated;

GRANT ALL ON FUNCTION public.save_shared_recipe_copy(text) TO service_role;
