-- ---------------------------------------------------------------------------
-- Recipes, as the screens read them.
--
-- The same rule as everything in 90_views.sql: a screen selects a row that
-- already has the numbers on it. A recipe's arithmetic is the sum of its
-- ingredients and that sum divided by the servings, and doing it here means the
-- list, the detail screen and the share card cannot round it three ways.
--
-- Every view is `security_invoker`, so the read policy on `recipes` is what
-- filters them.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- One ingredient, costed.
--
-- Per-unit macros times the amount. The same shape as
-- `food_log_ingredient_details`, and for the same reason: the row on screen and
-- the total above it are one calculation, not two.
-- ---------------------------------------------------------------------------
create view public.recipe_ingredient_details with (security_invoker = on) as
select
  i.id,
  i.recipe_id,
  i.food_id,
  i.position,
  i.name,
  i.amount,
  i.unit,
  i.kcal_per_unit,
  i.carbs_g_per_unit,
  i.protein_g_per_unit,
  i.fat_g_per_unit,
  round(i.kcal_per_unit      * i.amount)::integer    as kcal,
  round(i.carbs_g_per_unit   * i.amount, 1)::numeric as carbs_g,
  round(i.protein_g_per_unit * i.amount, 1)::numeric as protein_g,
  round(i.fat_g_per_unit     * i.amount, 1)::numeric as fat_g
from public.recipe_ingredients i;

grant select on public.recipe_ingredient_details to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- One recipe: the whole pot, and one serving of it.
--
-- Both figures, because both are read on the same screen and they answer
-- different questions, "is this pot worth cooking" and "what do I log". The
-- per-serving numbers used to be computed here and carried on a mirror `foods`
-- row, deliberately by two routes so a drifted mirror showed up as a discrepancy.
-- There is no mirror now, and this is the one place they are worked out.
--
-- `is_official` is the absence of an owner. `is_mine` is what the list tabs split
-- on, and it is computed here so no screen has to hold the session's user id next
-- to a row to know whether it may edit it.
-- ---------------------------------------------------------------------------
create view public.recipe_details with (security_invoker = on) as
select
  r.id,
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

  (r.owner_id is null)                              as is_official,
  -- Coalesced, because an official recipe has no owner and `null = uuid` is
  -- null: without this the tab that filters on `is_mine = false` would drop
  -- every row from the kitchen.
  coalesce(r.owner_id = (select auth.uid()), false) as is_mine,

  coalesce(t.ingredient_count, 0)      as ingredient_count,
  coalesce(t.kcal, 0)::integer         as total_kcal,
  coalesce(t.carbs_g, 0)::numeric      as total_carbs_g,
  coalesce(t.protein_g, 0)::numeric    as total_protein_g,
  coalesce(t.fat_g, 0)::numeric        as total_fat_g,

  round(coalesce(t.kcal, 0)      / greatest(r.servings, 1))::integer    as serving_kcal,
  round(coalesce(t.carbs_g, 0)   / greatest(r.servings, 1), 1)::numeric as serving_carbs_g,
  round(coalesce(t.protein_g, 0) / greatest(r.servings, 1), 1)::numeric as serving_protein_g,
  round(coalesce(t.fat_g, 0)     / greatest(r.servings, 1), 1)::numeric as serving_fat_g
  -- `food_id` and `default_serving_id` were here, so a screen could log a pot
  -- through the catalogue without a second round trip for two ids it used once.
  -- There is no mirror to name and no portion row to point at: a pot is logged
  -- from `serving_kcal` and the three macros beside it, which this view has
  -- always computed.
from public.recipes r
left join lateral (
  select
    count(*)::integer                     as ingredient_count,
    sum(i.kcal_per_unit      * i.amount)  as kcal,
    sum(i.carbs_g_per_unit   * i.amount)  as carbs_g,
    sum(i.protein_g_per_unit * i.amount)  as protein_g,
    sum(i.fat_g_per_unit     * i.amount)  as fat_g
  from public.recipe_ingredients i
  where i.recipe_id = r.id
) t on true;

grant select on public.recipe_details to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Reading a recipe somebody shared as a link.
--
-- `share_slug` is the bearer credential. A normal select still goes through
-- recipe RLS and cannot see private cooking; this function widens one read to
-- the one row named by the unguessable slug. Reports and blocks still win, so
-- opening an old message cannot bring back something the reader hid.
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_recipe(p_share_slug text)
returns setof public.recipe_details
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

comment on function public.get_shared_recipe is
  'Read the one recipe named by a private share link. The slug is the bearer '
  'credential; the caller must still be signed in, and their reports and '
  'blocked cooks remain hidden.';

revoke execute on function public.get_shared_recipe from public, anon;
grant execute on function public.get_shared_recipe to authenticated, service_role;


-- The ingredients are a separate query in the app, so they need the same
-- narrow link exception. Keeping the predicate beside the recipe read makes a
-- future moderation change fail both database tests instead of quietly showing
-- a hidden cook's ingredient list under an empty detail page.
create or replace function public.get_shared_recipe_ingredients(p_share_slug text)
returns setof public.recipe_ingredient_details
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

comment on function public.get_shared_recipe_ingredients is
  'Read the ingredients belonging to the one recipe named by a private share '
  'link, under the same signed-in, report and block rules as get_shared_recipe.';

revoke execute on function public.get_shared_recipe_ingredients from public, anon;
grant execute on function public.get_shared_recipe_ingredients to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Asking for a recipe to be published, and taking it back.
--
-- A function rather than an update, because `is_public` and `review_status` are
-- not in the client's column grant. What this can do is put a recipe in front of
-- a reviewer; what it cannot do at all is approve one. Every publish starts at
-- `pending`, including the second publish of a recipe that was approved and then
-- edited, which is the case that makes the reset matter: an approved recipe
-- rewritten into something else would otherwise stay approved on the strength of
-- a review of the old text.
--
-- Unpublishing leaves the verdict where it was. It is a fact about the text, and
-- re-publishing unchanged text does not need a second opinion, but it gets one
-- anyway, because the app cannot tell "unchanged" from "changed back".
-- ---------------------------------------------------------------------------
create or replace function public.set_recipe_public(
  p_recipe_id uuid,
  p_public    boolean
)
returns public.recipe_review
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.set_recipe_public is
  'Ask for a recipe to be listed in the community tab, or take it back. Always '
  'leaves the review at `pending`: approval is the review function''s to give, '
  'never the client''s. Owner-checked.';

revoke execute on function public.set_recipe_public from public, anon;
grant execute on function public.set_recipe_public to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Saving somebody else's recipe as your own.
--
-- A copy, not a reference. The whole promise of the community tab is "cook it
-- your way", and a saved recipe that pointed back at the original would either
-- forbid that or let one person's edit rewrite everybody's diary.
-- `source_recipe_id` keeps the provenance a reference would have given, at none
-- of the cost.
--
-- Security definer for one line of it: bumping `saved_count` on a row the caller
-- does not own and has no update grant on. Everything else here is something the
-- caller could have done itself, and the source is re-read through the same
-- visibility rule the client would have got, so this widens what can be done and
-- not what can be seen.
-- ---------------------------------------------------------------------------
create or replace function public.save_recipe_copy(p_recipe_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.save_recipe_copy is
  'Copy a visible recipe and its ingredients into the caller''s own, recording '
  'where it came from and counting the caller as one saver of the original, '
  'however many copies they make. Returns the new recipe id.';

revoke execute on function public.save_recipe_copy from public, anon;
grant execute on function public.save_recipe_copy to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Saving a privately shared recipe as your own.
--
-- The ordinary copy function accepts an id only after RLS would have shown the
-- source. A private link is deliberately not RLS-visible, so this sibling takes
-- the bearer slug and repeats the same copy without turning private cooking
-- into something enumerable. Keep the writes in step with save_recipe_copy.
-- ---------------------------------------------------------------------------
create or replace function public.save_shared_recipe_copy(p_share_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.save_shared_recipe_copy is
  'Copy the recipe named by a private share link into the signed-in caller''s '
  'own foods. The slug is the bearer credential; reports and blocked cooks '
  'remain hidden.';

revoke execute on function public.save_shared_recipe_copy from public, anon;
grant execute on function public.save_shared_recipe_copy to authenticated, service_role;
