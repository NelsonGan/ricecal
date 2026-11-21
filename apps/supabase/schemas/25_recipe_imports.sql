-- ---------------------------------------------------------------------------
-- Recipes imported from a cooking video.
--
-- Somebody shares a reel, a TikTok, a Short or a post to RiceCal (or pastes its
-- link), the `recipes` function reads the video and its caption, and the
-- answer becomes a recipe of theirs. README: "Importing a recipe from a video".
--
-- One row per VIDEO, not per person, and that is the cache. The model is asked
-- about a video once: the second person to import it gets the same draft out of
-- this table with no model call, which is both the cost control and the reason
-- two people importing one reel get the same dish rather than two guesses at
-- it. A video that is not a recipe is cached too, so pasting the same dance
-- clip twice costs one look.
--
-- Keyed by platform and the platform's own post id, never by the pasted text:
-- `instagram.com/reel/X/?igsh=…`, `instagram.com/p/X` and a share link that
-- redirects to either are one video, and keying by the text would run the
-- model once per tracking parameter.
--
-- Server only. Nothing here is the client's to read: the credit a reader sees
-- is copied onto the recipe (`recipes.import_platform` and friends), and the
-- caption, the draft and who imported it first are working notes.
-- ---------------------------------------------------------------------------

create table public.recipe_imports (
  id            uuid primary key default gen_random_uuid(),

  platform      text not null check (
    platform in ('instagram', 'tiktok', 'youtube', 'x', 'threads', 'facebook', 'rednote')
  ),
  -- The platform's id for the post: a shortcode, a numeric id, a note id.
  video_id      text not null check (video_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  -- Rebuilt by the server from the two above, so it is safe to show.
  canonical_url text not null check (
    char_length(canonical_url) <= 500 and canonical_url ~* '^https://[^[:space:]]+$'
  ),

  -- What the model decided. A failure to fetch or to read is not cached, so a
  -- platform hiccup or a model outage can be retried.
  status        text not null check (status in ('recipe', 'not_recipe')),
  -- The recipe as `recipe_ingredients` stores it (per-unit figures, see
  -- `toIngredientRow`), plus the recipe's own fields. Null for `not_recipe`.
  draft         jsonb,
  constraint recipe_imports_draft_present check ((status = 'recipe') = (draft is not null)),
  -- Why it is not a recipe, in the model's words, for the logs.
  reason        text check (char_length(reason) <= 500),

  -- What the post said about itself, kept for credit and for re-reading the
  -- draft if the prompt improves.
  author_handle text check (char_length(author_handle) <= 80),
  title         text check (char_length(title) <= 300),
  caption       text check (char_length(caption) <= 5000),
  -- `video` when the model watched the video itself, `caption` when only the
  -- caption, title and cover image were to be had.
  analysed_from text not null check (analysed_from in ('video', 'caption')),

  -- The cover, copied into storage once (`imports/<id>.jpg`) so every later
  -- importer gets their own copy without asking the platform again: the URLs
  -- platforms hand out for a cover are signed and expire within days.
  photo_key     text check (photo_key ~ '^imports/[A-Za-z0-9_.-]+$'),

  -- The one recipe from this video on the community shelf. The first importer's
  -- recipe is published; everybody after them gets a private recipe of their
  -- own that counts as a save of it, so one reel is one card on the shelf
  -- rather than one card per person who liked it. `set null` so a deleted or
  -- unpublished original hands the job to the next importer.
  community_recipe_id uuid references public.recipes (id) on delete set null,

  -- Who asked first, for abuse investigations. Never shown.
  created_by    uuid references auth.users (id) on delete set null,
  -- How many recipes have been made from it, cached ones included.
  imports       integer not null default 0 check (imports >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint recipe_imports_video_key unique (platform, video_id)
);

create index recipe_imports_created_by_idx on public.recipe_imports (created_by)
  where created_by is not null;
create index recipe_imports_community_idx on public.recipe_imports (community_recipe_id)
  where community_recipe_id is not null;

create trigger recipe_imports_set_updated_at
  before update on public.recipe_imports
  for each row execute function public.set_updated_at();

alter table public.recipe_imports enable row level security;

revoke all on public.recipe_imports from public, anon, authenticated;
grant select, insert, update, delete on public.recipe_imports to service_role;
create policy "Server only" on public.recipe_imports as restrictive for all to anon, authenticated
  using (false) with check (false);


-- Which import a recipe was made from. Here rather than in `22_recipes.sql`
-- because the table it references has to exist first. Server-written and in
-- neither client grant, because it is what exempts a recipe from the kept-
-- recipe ceiling (`recipes_enforce_free_limit`).
alter table public.recipes
  add column import_id uuid references public.recipe_imports (id) on delete set null;

create index recipes_import_idx on public.recipes (import_id, owner_id)
  where import_id is not null;


-- ---------------------------------------------------------------------------
-- How many videos an account has imported this month, and the ceilings.
--
-- Its own meter rather than a scan. A scan is a daily allowance for logging
-- meals; an import is a recipe for the shelf, wanted a few times a month, and
-- spending three of a free account's daily scans on one reel would make
-- importing and logging compete. Five a month free, sold as unlimited on Pro.
--
-- The Pro figure is an abuse ceiling wearing a quota's clothes, like the scan
-- one: two hundred recipes a month is not a kitchen, and nothing prints it.
--
-- A month is the user's own calendar month, from `local_today`, for the reason
-- `scan_usage` keys by the local day.
--
-- What counts is a recipe arriving on the shelf, cached or not. A video that is
-- not a recipe, a link that cannot be read and a second import of a video the
-- account already has take nothing. The model runs those cost are bounded by
-- the hourly ceiling below instead.
-- ---------------------------------------------------------------------------

create table public.recipe_import_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- The first day of the user's own month.
  month      date not null check (extract(day from month) = 1),
  imports    integer not null default 0 check (imports >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create trigger recipe_import_usage_set_updated_at
  before update on public.recipe_import_usage
  for each row execute function public.set_updated_at();

alter table public.recipe_import_usage enable row level security;

grant select on public.recipe_import_usage to authenticated;
grant select, insert, update, delete on public.recipe_import_usage to service_role;

create policy "recipe_import_usage: read own"
  on public.recipe_import_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.free_monthly_imports()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 5;
$$;

revoke execute on function public.free_monthly_imports from public, anon;
grant execute on function public.free_monthly_imports to authenticated, service_role;

create or replace function public.pro_monthly_imports()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 200;
$$;

revoke execute on function public.pro_monthly_imports from public, anon, authenticated;
grant execute on function public.pro_monthly_imports to service_role;

-- Security definer to reach `is_entitled`, which is not granted to clients.
create or replace function public.recipe_import_monthly_limit(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_entitled(p_user) then public.pro_monthly_imports()
    else public.free_monthly_imports()
  end;
$$;

revoke execute on function public.recipe_import_monthly_limit from public, anon, authenticated;
grant execute on function public.recipe_import_monthly_limit to service_role;

-- This month's imports for one account: what `recipe_import_usage_this_month`
-- answers for the caller, and what the function checks before asking a model.
create or replace function public.recipe_import_allowance(p_user uuid)
returns table (
  used          integer,
  monthly_limit integer,
  remaining     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(u.imports, 0),
    public.recipe_import_monthly_limit(p_user),
    greatest(public.recipe_import_monthly_limit(p_user) - coalesce(u.imports, 0), 0)
  from (select 1) as one
  left join public.recipe_import_usage u
    on u.user_id = p_user
   and u.month = date_trunc('month', public.local_today(p_user))::date;
$$;

revoke execute on function public.recipe_import_allowance from public, anon, authenticated;
grant execute on function public.recipe_import_allowance to service_role;

-- What the import sheet prints ("2 of 5 left this month"). The caller's own
-- row only, so it takes no user id.
create or replace function public.recipe_import_usage_this_month()
returns table (
  used          integer,
  monthly_limit integer,
  remaining     integer,
  entitled      boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.used, a.monthly_limit, a.remaining, public.is_entitled((select auth.uid()))
  from public.recipe_import_allowance((select auth.uid())) a
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.recipe_import_usage_this_month from public, anon;
grant execute on function public.recipe_import_usage_this_month to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- How many uncached videos an account has asked the model about this hour.
--
-- The monthly meter only counts recipes that arrive, so on its own it would let
-- somebody paste a thousand dance clips at our model bill: each is "not a
-- recipe" and takes nothing. This is the ceiling on that, shaped exactly like
-- `recipe_review_usage`: per account, per hour, atomic, no client write grant.
-- Twenty is far above anybody importing their week's cooking, and a cached
-- video asks nobody, so it does not count.
-- ---------------------------------------------------------------------------

create table public.recipe_import_runs (
  user_id      uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  runs         integer not null default 0 check (runs >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, window_start)
);

create trigger recipe_import_runs_set_updated_at
  before update on public.recipe_import_runs
  for each row execute function public.set_updated_at();

alter table public.recipe_import_runs enable row level security;

revoke all on public.recipe_import_runs from public, anon, authenticated;
grant select, insert, update, delete on public.recipe_import_runs to service_role;
create policy "Server only" on public.recipe_import_runs as restrictive for all to anon, authenticated
  using (false) with check (false);

create or replace function public.recipe_import_hourly_runs()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 20;
$$;

revoke execute on function public.recipe_import_hourly_runs from public, anon, authenticated;
grant execute on function public.recipe_import_hourly_runs to service_role;

-- The same guarded upsert as `claim_recipe_review`: the check and the increment
-- are one statement under one row lock.
create or replace function public.claim_recipe_import_run(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.claim_recipe_import_run from public, anon, authenticated;
grant execute on function public.claim_recipe_import_run to service_role;


-- ---------------------------------------------------------------------------
-- Turn a cached import into a recipe of this account's, in one transaction.
--
-- The month's allowance is claimed in the same statement that makes the
-- recipe, so a recipe that failed to be written never cost an import and two
-- concurrent imports at four of five cannot both get through. The import row is
-- locked first, so two people importing one video at the same moment cannot
-- both become its community recipe.
--
-- Importing a video you already have hands back the recipe you have, free: a
-- second share of the same reel is somebody who forgot, not a second recipe.
--
-- The recipe is written from the cached draft, never from anything the caller
-- sends, and only the server can call this. The cover's object key is minted
-- by the caller under this user's prefix, because only the server can copy an
-- object.
--
-- Returns the new recipe, whether it is the community one, and the community
-- recipe's id and review state so the caller can run a review nobody ran.
-- ---------------------------------------------------------------------------
create or replace function public.import_recipe_for(
  p_user       uuid,
  p_import     uuid,
  p_photo_path text default null
)
returns table (
  recipe_id           uuid,
  existing            boolean,
  allowed             boolean,
  used                integer,
  monthly_limit       integer,
  community_recipe_id uuid,
  community_review    public.recipe_review,
  is_community        boolean
)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.import_recipe_for is
  'Make a recipe for p_user out of a cached video import, claiming one of the '
  'month''s imports in the same transaction. The first importer''s recipe is '
  'published (pending review); later importers get a private recipe counted as '
  'a save of it. Server only.';

revoke execute on function public.import_recipe_for from public, anon, authenticated;
grant execute on function public.import_recipe_for to service_role;
