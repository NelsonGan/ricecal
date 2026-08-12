-- The catalogue leaves this database.
--
-- `foods`, `food_servings`, `food_aliases` and `food_sources` are in Cloudflare
-- D1 now, behind a Worker. This migration is the other half of that move: it
-- makes the diary able to stand without them.
--
-- WHY THE ENTRY HAS TO CARRY ITS OWN NUMBERS
--
-- Every calorie the app has ever shown came from a JOIN. `food_log_details`
-- multiplied a catalogue row's macros by a portion's factor by a quantity, and
-- `daily_nutrition`, the trends and the week strip all rolled up from that. A
-- foreign key cannot cross into another database, so either the numbers travel
-- with the entry or a day's total becomes a network call.
--
-- So they travel with the entry. This overturns an invariant that was written
-- down and argued for — "Entries reference the catalogue; they do not copy its
-- macros… a snapshot would make history immutable but also permanently wrong" —
-- and the trade is now the other way round: a dish corrected in the catalogue no
-- longer corrects the diaries that used it. `food_id` is kept as a SOFT
-- reference, unconstrained, so a future job could re-snapshot entries against
-- the current catalogue. Not automatic. Recoverable.
--
-- WHAT THIS BUYS
--
-- The catalogue becomes disposable. It can be truncated, rebuilt and reloaded
-- without touching a diary — which is not hypothetical: a reload of it took this
-- app down to 6,451 foods once, because the delete had to cascade through
-- entries that pointed at the rows being replaced.

-- ---------------------------------------------------------------------------
-- 1. The snapshot columns
-- ---------------------------------------------------------------------------
-- Nullable to start, because the backfill runs between adding them and
-- requiring them.

alter table public.food_logs
  add column if not exists item_name      text,
  add column if not exists item_brand     text,
  add column if not exists item_icon_set  public.icon_set,
  add column if not exists item_icon_name text,
  -- `place` was a column on the catalogue row and the view exposed it, so it
  -- travels with the entry like everything else the view reads.
  add column if not exists item_place     public.food_place,
  -- Per ONE base serving, exactly as `foods` stored them. The entry's totals are
  -- still base x factor x quantity, so the stepper and the portion keep working
  -- and nothing downstream has to learn a new arithmetic.
  add column if not exists base_kcal      integer,
  add column if not exists base_carbs_g   numeric(6, 1),
  add column if not exists base_protein_g numeric(6, 1),
  add column if not exists base_fat_g     numeric(6, 1),
  add column if not exists base_fibre_g   numeric(6, 1),
  add column if not exists base_sugar_g   numeric(6, 1),
  add column if not exists base_sodium_mg integer,
  -- The portion, as it was chosen. `serving_id` pointed into `food_servings`;
  -- what it MEANT was these three values.
  add column if not exists serving_label  text,
  add column if not exists serving_factor numeric(6, 3),
  add column if not exists serving_grams  numeric(9, 2);

alter table public.food_log_ingredients
  add column if not exists item_name      text,
  add column if not exists base_kcal      integer,
  add column if not exists base_carbs_g   numeric(6, 1),
  add column if not exists base_protein_g numeric(6, 1),
  add column if not exists base_fat_g     numeric(6, 1),
  add column if not exists serving_label  text,
  add column if not exists serving_factor numeric(6, 3);

-- ---------------------------------------------------------------------------
-- 2. Backfill, while the catalogue is still here to be read
-- ---------------------------------------------------------------------------

update public.food_logs e set
  item_name      = coalesce(e.item_name, f.name),
  item_brand     = coalesce(e.item_brand, f.brand),
  item_icon_set  = coalesce(e.item_icon_set, f.icon_set),
  item_icon_name = coalesce(e.item_icon_name, f.icon_name),
  item_place     = coalesce(e.item_place, f.place),
  base_kcal      = coalesce(e.base_kcal, f.kcal),
  base_carbs_g   = coalesce(e.base_carbs_g, f.carbs_g),
  base_protein_g = coalesce(e.base_protein_g, f.protein_g),
  base_fat_g     = coalesce(e.base_fat_g, f.fat_g),
  base_fibre_g   = coalesce(e.base_fibre_g, f.fibre_g),
  base_sugar_g   = coalesce(e.base_sugar_g, f.sugar_g),
  base_sodium_mg = coalesce(e.base_sodium_mg, f.sodium_mg),
  serving_label  = coalesce(e.serving_label, s.label),
  serving_factor = coalesce(e.serving_factor, s.factor),
  serving_grams  = coalesce(e.serving_grams, s.grams)
from public.foods f
left join public.food_servings s on s.id = (
  select id from public.food_servings where food_id = f.id and is_default limit 1
)
where f.id = e.food_id;

-- The portion actually chosen, where it was not the default.
update public.food_logs e set
  serving_label  = s.label,
  serving_factor = s.factor,
  serving_grams  = s.grams
from public.food_servings s
where s.id = e.serving_id;

update public.food_log_ingredients i set
  item_name      = coalesce(i.item_name, i.display_label, f.name),
  base_kcal      = coalesce(i.base_kcal, f.kcal),
  base_carbs_g   = coalesce(i.base_carbs_g, f.carbs_g),
  base_protein_g = coalesce(i.base_protein_g, f.protein_g),
  base_fat_g     = coalesce(i.base_fat_g, f.fat_g),
  serving_label  = coalesce(i.serving_label, s.label),
  serving_factor = coalesce(i.serving_factor, s.factor)
from public.foods f
left join public.food_servings s on s.id = (
  select id from public.food_servings where food_id = f.id and is_default limit 1
)
where f.id = i.food_id;

update public.food_log_ingredients i set
  serving_label  = s.label,
  serving_factor = s.factor
from public.food_servings s
where s.id = i.serving_id;

-- Anything the join could not reach — an entry whose food was already gone —
-- gets an honest placeholder rather than a null that breaks the arithmetic.
update public.food_logs set
  item_name      = coalesce(item_name, 'Logged item'),
  base_kcal      = coalesce(base_kcal, 0),
  base_carbs_g   = coalesce(base_carbs_g, 0),
  base_protein_g = coalesce(base_protein_g, 0),
  base_fat_g     = coalesce(base_fat_g, 0),
  serving_label  = coalesce(serving_label, '1 serving'),
  serving_factor = coalesce(serving_factor, 1)
where item_name is null or base_kcal is null or serving_factor is null;

update public.food_log_ingredients set
  item_name      = coalesce(item_name, display_label, 'Ingredient'),
  base_kcal      = coalesce(base_kcal, 0),
  base_carbs_g   = coalesce(base_carbs_g, 0),
  base_protein_g = coalesce(base_protein_g, 0),
  base_fat_g     = coalesce(base_fat_g, 0),
  serving_label  = coalesce(serving_label, '1 serving'),
  serving_factor = coalesce(serving_factor, 1)
where item_name is null or base_kcal is null or serving_factor is null;

alter table public.food_logs
  alter column item_name      set not null,
  alter column base_kcal      set not null,
  alter column base_carbs_g   set not null,
  alter column base_protein_g set not null,
  alter column base_fat_g     set not null,
  alter column serving_label  set not null,
  alter column serving_factor set not null;

alter table public.food_log_ingredients
  alter column item_name      set not null,
  alter column base_kcal      set not null,
  alter column serving_factor set not null;

-- ---------------------------------------------------------------------------
-- 3. Cut the references
-- ---------------------------------------------------------------------------
-- `food_id` survives every one of these as a plain uuid: it is what a
-- re-snapshot job would join on, what `user_food_stats` groups by, and what the
-- scan backlog ranks. What it stops being is a constraint.

alter table public.food_logs
  drop constraint if exists food_logs_food_id_serving_id_fkey,
  drop constraint if exists food_logs_food_id_fkey,
  drop constraint if exists food_logs_serving_id_fkey;
-- Both of these named rows in tables that no longer exist. They stay as plain
-- uuids — provenance a re-snapshot job would join on — but nothing may require
-- them, and `serving_id` in particular was `not null` because a portion always
-- belonged to a dish. There are no dishes here now.
alter table public.food_logs alter column food_id drop not null;
alter table public.food_logs alter column serving_id drop not null;

alter table public.food_log_ingredients
  drop constraint if exists food_log_ingredients_food_id_serving_id_fkey,
  drop constraint if exists food_log_ingredients_food_id_fkey,
  drop constraint if exists food_log_ingredients_serving_id_fkey;
alter table public.food_log_ingredients alter column food_id drop not null;
alter table public.food_log_ingredients alter column serving_id drop not null;

alter table public.food_scan_items
  drop constraint if exists food_scan_items_resolved_food_id_fkey;

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_food_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. The recipe mirror, which has nothing left to mirror into
-- ---------------------------------------------------------------------------
-- A recipe was copied into a `foods` row so that `food_logs.food_id` could
-- reference it — the mirror existed for the foreign key, and the foreign key is
-- gone. Logging a recipe now writes the same snapshot every other entry writes,
-- taken from `recipe_details`.

-- The two triggers that existed ONLY to keep the mirror in step, plus the one
-- that deleted it. `recipes_sync_food` and `recipes_sync_food_insert` are the
-- real trigger names; `recipes_after_write` is the function they shared.
drop trigger if exists recipes_sync_food on public.recipes;
drop trigger if exists recipes_sync_food_insert on public.recipes;
drop trigger if exists recipes_after_delete on public.recipes;
drop function if exists public.recipes_after_write() cascade;
drop function if exists public.recipes_after_delete() cascade;
drop function if exists public.recipe_sync_food(uuid) cascade;

-- TWO FUNCTIONS ARE REPLACED RATHER THAN DROPPED, because each does something
-- besides the mirror and dropping them would take that with it silently.
--
-- `recipes_before_insert` also mints the share slug and copies the author name.
-- Without it `share_slug` is `not null` with no default and every recipe insert
-- fails — including the client's, which cannot supply one.
--
-- `recipe_ingredients_after_write` also calls `recipe_mark_for_review`, which is
-- THE PUBLISHING GATE'S SECOND HALF: changing what went into a published pot
-- has to send it back to a reviewer. Losing that means an approved recipe can be
-- rewritten into something nobody read.
--
-- Both bodies are copied verbatim out of `schemas/22_recipes.sql`. Postgres
-- stores `prosrc` as written and `db diff` compares the comments too, so a
-- version retyped here would declare a function no migration produces.

create or replace function public.recipes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stem text;
begin
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
$$;

create or replace function public.recipe_ingredients_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe_id uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  -- This used to rebuild the mirror as well. What is left is the half that
  -- matters: changing what went into a published pot sends it back to the
  -- reviewer, because the ingredient list is part of what was approved.
  perform public.recipe_mark_for_review(v_recipe_id);
  return null;
end;
$$;

-- Renamed with it, because the old name said it synced a catalogue row.
drop trigger if exists recipe_ingredients_sync_food on public.recipe_ingredients;
drop trigger if exists recipe_ingredients_after_write on public.recipe_ingredients;
create trigger recipe_ingredients_after_write
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_after_write();

-- `recipe_details` reads `r.food_id` and joins `food_servings` for a default
-- portion, so it has to come down before the column can. It is rebuilt below
-- without either — it already exposes `serving_kcal` and the per-serving
-- macros, which is everything a snapshot needs to log a pot.
drop view if exists public.recipe_details cascade;

alter table public.recipes drop constraint if exists recipes_food_id_key;
alter table public.recipes drop constraint if exists recipes_food_id_fkey;
alter table public.recipes drop column if exists food_id;

-- Provenance for an entry logged from a pot. Soft, like `food_id`, and for the
-- same reason: it is worth knowing where a snapshot came from, and it must not
-- stop a recipe being deleted.
alter table public.food_logs
  add column if not exists recipe_id uuid;

-- ---------------------------------------------------------------------------
-- 5. The read shapes, without the join
-- ---------------------------------------------------------------------------

drop view if exists public.food_log_details cascade;
drop view if exists public.food_log_ingredient_details cascade;
drop view if exists public.user_food_stats cascade;
drop view if exists public.food_details cascade;

-- One logged item, with the numbers already worked out — from the entry's own
-- snapshot rather than from a catalogue that is no longer here. The arithmetic
-- is unchanged (base x factor x quantity) and so is every column name, because
-- everything above this view was written against them.
create view public.food_log_details with (security_invoker = on) as
select
  e.id,
  e.user_id,
  e.log_date,
  e.quantity,
  e.logged_at,
  e.note,
  e.source,
  e.photo_path,
  e.food_id,
  e.scan_id,
  e.suggested_edits,
  -- EVERY COLUMN NAME HERE IS THE ONE IT WAS. The screens, the mappers and four
  -- views above this one were written against them, and a move of where the
  -- data lives must not become a rename. `food_verified`, `is_estimate` and
  -- `is_archetype` were flags on the catalogue row; nothing in a diary can tell
  -- any more, and nothing reads them for more than a badge.
  coalesce(e.display_label, e.item_name)                              as food_name,
  e.item_brand                                                        as food_brand,
  false                                                               as food_verified,
  false                                                               as is_estimate,
  false                                                               as is_archetype,
  -- A photo suppresses both icons outright, exactly as before: the entry's own
  -- icon wins over the food's, and a photograph wins over either.
  case when e.photo_path is null then coalesce(e.icon_set,  e.item_icon_set)  end as icon_set,
  case when e.photo_path is null then coalesce(e.icon_name, e.item_icon_name) end as icon_name,
  e.item_place                                                        as place,
  e.serving_id,
  e.serving_label,
  e.serving_factor,
  e.override_kcal,
  e.override_carbs_g,
  e.override_protein_g,
  e.override_fat_g,
  -- `override_*` still wins, and the parts still beat the dish: the three-source
  -- coalesce this view has always applied is untouched, only its last source is
  -- now the row itself.
  coalesce(
    e.override_kcal,
    (select round(sum(i.base_kcal * i.serving_factor * i.quantity))::integer
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_kcal * e.serving_factor * e.quantity)::integer
  )                                                                   as kcal,
  coalesce(
    e.override_carbs_g,
    (select round(sum(i.base_carbs_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_carbs_g * e.serving_factor * e.quantity, 1)
  )                                                                   as carbs_g,
  coalesce(
    e.override_protein_g,
    (select round(sum(i.base_protein_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_protein_g * e.serving_factor * e.quantity, 1)
  )                                                                   as protein_g,
  coalesce(
    e.override_fat_g,
    (select round(sum(i.base_fat_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_fat_g * e.serving_factor * e.quantity, 1)
  )                                                                   as fat_g,
  round(e.base_fibre_g   * e.serving_factor * e.quantity, 1)          as fibre_g,
  round(e.base_sugar_g   * e.serving_factor * e.quantity, 1)          as sugar_g,
  round(e.base_sodium_mg * e.serving_factor * e.quantity)::integer    as sodium_mg,
  round(e.serving_grams  * e.quantity, 1)                             as grams,
  e.recipe_id,

  -- THE SNAPSHOT ITSELF, unmultiplied, because one caller wants to COPY an
  -- entry rather than read it: "repeat yesterday" writes today's row from
  -- yesterday's, and every figure above has already been through the portion
  -- and the quantity. Dividing them back out is lossy — they are rounded — and
  -- a repeat that lands a calorie off the row it copied is a bug nobody can
  -- explain. These are the columns as stored.
  e.item_name,
  e.item_brand,
  e.base_kcal,
  e.base_carbs_g,
  e.base_protein_g,
  e.base_fat_g,
  e.base_fibre_g,
  e.base_sugar_g,
  e.base_sodium_mg,
  e.serving_grams as base_serving_grams
from public.food_logs e;

grant select on public.food_log_details to authenticated, service_role;

create view public.food_log_ingredient_details with (security_invoker = on) as
select
  i.id,
  i.food_log_id,
  i.food_id,
  i.position,
  coalesce(i.display_label, i.item_name)                    as name,
  i.quantity,
  i.serving_label,
  round(i.base_kcal      * i.serving_factor * i.quantity)::integer as kcal,
  round(i.base_carbs_g   * i.serving_factor * i.quantity, 1)       as carbs_g,
  round(i.base_protein_g * i.serving_factor * i.quantity, 1)       as protein_g,
  round(i.base_fat_g     * i.serving_factor * i.quantity, 1)       as fat_g,
  round(i.grams * i.quantity, 1)                                   as grams
from public.food_log_ingredients i;

grant select on public.food_log_ingredient_details to authenticated, service_role;

-- Rebuilt because `drop view … cascade` above took it with `food_log_details`,
-- which is what it is built on. Its own definition is unchanged — the day's
-- totals were always a sum over that view, and the view still produces the same
-- columns. Everything above it in turn (`trend_days`, `trend_series`,
-- `trend_summary`, `day_marks`, `logging_streak`) is a FUNCTION and so survived
-- the cascade untouched; they read these same column names and keep working.
create view public.daily_nutrition with (security_invoker = on) as
select
  d.user_id,
  d.log_date,
  sum(d.kcal)::integer          as kcal,
  sum(d.carbs_g)::numeric       as carbs_g,
  sum(d.protein_g)::numeric     as protein_g,
  sum(d.fat_g)::numeric         as fat_g,
  sum(d.fibre_g)::numeric       as fibre_g,
  sum(d.sugar_g)::numeric       as sugar_g,
  count(*)::integer             as entry_count
from public.food_log_details d
group by d.user_id, d.log_date;

grant select on public.daily_nutrition to authenticated;

-- "What I log most", which never needed the catalogue for anything but the
-- exclusions. The snapshot carries the name, so the grouping carries it too.
create view public.user_food_stats with (security_invoker = on) as
select
  e.user_id,
  e.food_id,
  max(e.item_name)         as name,
  count(*)::integer        as times_logged,
  max(e.logged_at)         as last_logged_at
from public.food_logs e
where e.food_id is not null
group by e.user_id, e.food_id;

grant select on public.user_food_stats to authenticated;

-- `recipe_details`, rebuilt without the mirror. `food_id` and
-- `default_serving_id` are gone: both existed only to hand a screen the ids it
-- needed to log a pot through the catalogue, and a pot is logged from its own
-- per-serving figures now — which this view already computed.
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
-- 6. The archetypes stay, because the cascade's floor must not need a network
-- ---------------------------------------------------------------------------
-- Tier 5 is what a photo scan lands on when the catalogue, the model or the
-- connection has failed it. Sixty rows, resolved by classification over a fixed
-- list, and the terminal one is reached by a hardcoded id that needs no query at
-- all. Putting them behind an HTTP call would mean the fallback for "the network
-- failed" is itself a network call.

create table if not exists public.archetypes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  kcal       integer not null,
  carbs_g    numeric(6, 1) not null,
  protein_g  numeric(6, 1) not null,
  fat_g      numeric(6, 1) not null
);

insert into public.archetypes (id, slug, name, kcal, carbs_g, protein_g, fat_g)
select f.id, f.slug, f.name, f.kcal, f.carbs_g, f.protein_g, f.fat_g
from public.foods f
where f.is_archetype
on conflict (id) do nothing;

alter table public.archetypes enable row level security;
grant select on public.archetypes to authenticated;
grant select, insert, update, delete on public.archetypes to service_role;

create policy "archetypes: read" on public.archetypes
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 7. Drop the catalogue
-- ---------------------------------------------------------------------------

drop function if exists public.search_foods(text, public.food_place, integer, boolean) cascade;
drop function if exists public.lookup_barcode(text) cascade;
drop function if exists public.load_catalogue_batch(jsonb) cascade;
drop function if exists public.import_foods(jsonb, boolean) cascade;
drop function if exists public.upsert_estimate_food(text, integer, numeric, numeric, numeric, numeric, numeric, integer) cascade;
drop function if exists public.estimate_food_backlog(integer) cascade;
drop function if exists public.seed_archetype_foods() cascade;
drop function if exists public.seed_food_sources() cascade;
drop function if exists public.foods_set_search() cascade;
drop function if exists public.food_aliases_set_norm() cascade;
drop function if exists public.food_name_norm(text, text) cascade;
-- The two full-text helpers existed for `search_foods` and nothing else. Their
-- equivalent is FTS5 in the Worker. `search_normalize` STAYS: it is what mints
-- a recipe's share slug, and a link already sent to somebody has to keep
-- resolving to the same string.
drop function if exists public.search_tsquery(text) cascade;
drop function if exists public.search_tsquery_all(text) cascade;

-- Indexes that existed to keep an `on delete restrict` from scanning the diary
-- whenever a catalogue row was touched. No catalogue row is touched from here
-- any more, and nothing reads a log by its portion, so they were pure write
-- cost. The `food_id` one on `food_log_ingredients` goes for the same reason;
-- `food_logs (user_id, food_id)` stays, because `user_food_stats` groups by it.
drop index if exists public.food_logs_serving_idx;
drop index if exists public.food_log_ingredients_food_idx;
drop index if exists public.food_log_ingredients_serving_idx;

drop table if exists public.food_aliases cascade;
drop table if exists public.food_servings cascade;
drop table if exists public.foods cascade;
drop table if exists public.food_sources cascade;

-- ---------------------------------------------------------------------------
-- 8. The seed, restated against its new home
-- ---------------------------------------------------------------------------
-- Dropped above with everything else that wrote to `foods`, and recreated here
-- because the sixty rows still have to come from somewhere on a fresh database.
-- The body is COPIED VERBATIM out of `schemas/33_archetypes.sql`, comments and
-- all: Postgres stores `prosrc` exactly as written and `db diff` compares the
-- comment text too, so a version retyped for length declares a function no
-- migration produces and fails the `migrations` job on a change that is
-- genuinely in the repo.
--
-- Not called here. The rows were copied straight across in section 6, and
-- calling it would rewrite sixty names and figures the app is already using.

create or replace function public.seed_archetype_foods()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select * from (values
      -- The terminal row. Its id is hardcoded in the scan edge function; if it
      -- ever changes, change it there too.
      ('a0000000-0000-4000-8000-000000000000'::uuid, 'archetype-mixed-meal',      'Mixed meal',              600, 70.0, 20.0, 25.0),
      (null::uuid, 'archetype-mixed-meal-light',     'Mixed meal, light',         400, 45.0, 15.0, 16.0),
      (null::uuid, 'archetype-mixed-meal-large',     'Mixed meal, large',         850, 95.0, 30.0, 36.0),

      -- Rice
      (null::uuid, 'archetype-fried-rice',           'Fried rice',                640, 82.0, 18.0, 26.0),
      (null::uuid, 'archetype-steamed-rice',         'Steamed rice',              205, 45.0,  4.0,  0.5),
      (null::uuid, 'archetype-nasi-lemak',           'Nasi lemak',                650, 75.0, 18.0, 30.0),
      (null::uuid, 'archetype-rice-with-dishes',     'Rice with dishes',          620, 75.0, 25.0, 24.0),
      (null::uuid, 'archetype-biryani',              'Biryani rice',              700, 90.0, 25.0, 26.0),
      (null::uuid, 'archetype-porridge',             'Rice porridge',             220, 40.0, 10.0,  3.0),

      -- Noodles and pasta
      (null::uuid, 'archetype-fried-noodles',        'Fried noodles',             660, 80.0, 20.0, 28.0),
      (null::uuid, 'archetype-noodle-soup',          'Noodle soup',               400, 55.0, 20.0, 10.0),
      (null::uuid, 'archetype-laksa',                'Laksa',                     550, 60.0, 22.0, 25.0),
      (null::uuid, 'archetype-pasta-tomato',         'Pasta, tomato sauce',       450, 70.0, 15.0, 12.0),
      (null::uuid, 'archetype-pasta-creamy',         'Pasta, cream sauce',        620, 65.0, 20.0, 32.0),
      (null::uuid, 'archetype-instant-noodles',      'Instant noodles',           380, 52.0,  8.0, 15.0),

      -- Bread and wraps
      (null::uuid, 'archetype-sandwich',             'Sandwich',                  350, 40.0, 15.0, 14.0),
      (null::uuid, 'archetype-burger',               'Burger',                    550, 45.0, 25.0, 29.0),
      (null::uuid, 'archetype-pizza-slice',          'Pizza slice',               285, 33.0, 12.0, 11.0),
      (null::uuid, 'archetype-bread-roll',           'Bread roll',                180, 32.0,  5.0,  3.0),
      (null::uuid, 'archetype-roti-canai',           'Roti canai',                300, 40.0,  6.0, 12.0),
      (null::uuid, 'archetype-naan',                 'Naan / flatbread',          260, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-toast',                'Toast with spread',         200, 26.0,  4.0,  9.0),
      (null::uuid, 'archetype-pau',                  'Steamed bun',               280, 45.0,  9.0,  6.0),
      (null::uuid, 'archetype-kebab-wrap',           'Kebab / wrap',              550, 50.0, 28.0, 26.0),

      -- Small plates
      (null::uuid, 'archetype-dumplings',            'Dumplings',                 320, 40.0, 14.0, 11.0),
      (null::uuid, 'archetype-sushi-roll',           'Sushi roll',                300, 55.0, 10.0,  4.0),
      (null::uuid, 'archetype-spring-rolls',         'Spring rolls',              250, 28.0,  8.0, 12.0),
      (null::uuid, 'archetype-satay',                'Satay skewers',             350, 12.0, 28.0, 21.0),

      -- Protein mains
      (null::uuid, 'archetype-fried-chicken',        'Fried chicken',             430, 15.0, 30.0, 27.0),
      (null::uuid, 'archetype-grilled-chicken',      'Grilled chicken',           300,  2.0, 40.0, 14.0),
      (null::uuid, 'archetype-chicken-curry',        'Chicken curry',             450, 12.0, 30.0, 30.0),
      (null::uuid, 'archetype-beef-stew',            'Beef stew / rendang',       400, 15.0, 35.0, 22.0),
      (null::uuid, 'archetype-steak',                'Steak',                     450,  2.0, 40.0, 30.0),
      (null::uuid, 'archetype-grilled-fish',         'Grilled fish',              250,  2.0, 35.0, 11.0),
      (null::uuid, 'archetype-fried-fish',           'Fried fish',                350, 12.0, 28.0, 20.0),
      (null::uuid, 'archetype-seafood-dish',         'Seafood dish',              300, 10.0, 30.0, 15.0),
      (null::uuid, 'archetype-tofu-dish',            'Tofu dish',                 250, 12.0, 15.0, 16.0),
      (null::uuid, 'archetype-egg-dish',             'Egg dish',                  180,  2.0, 12.0, 14.0),
      (null::uuid, 'archetype-curry-dish',           'Curry dish',                400, 20.0, 20.0, 26.0),

      -- Vegetables, soups, salads
      (null::uuid, 'archetype-stir-fried-vegetables','Stir-fried vegetables',     120, 10.0,  4.0,  8.0),
      (null::uuid, 'archetype-steamed-vegetables',   'Steamed vegetables',         60, 10.0,  3.0,  1.0),
      (null::uuid, 'archetype-salad',                'Salad with dressing',       180, 12.0,  5.0, 12.0),
      (null::uuid, 'archetype-clear-soup',           'Clear soup',                120, 10.0,  8.0,  5.0),
      (null::uuid, 'archetype-creamy-soup',          'Creamy soup',               250, 20.0,  8.0, 15.0),

      -- Drinks
      (null::uuid, 'archetype-teh-tarik',            'Milk tea',                  130, 20.0,  3.0,  4.0),
      (null::uuid, 'archetype-kopi',                 'Coffee with milk',          120, 18.0,  3.0,  4.0),
      (null::uuid, 'archetype-black-coffee-tea',     'Black coffee / plain tea',    5,  1.0,  0.0,  0.0),
      (null::uuid, 'archetype-soft-drink',           'Soft drink',                140, 35.0,  0.0,  0.0),
      (null::uuid, 'archetype-fruit-juice',          'Fruit juice',               120, 28.0,  1.0,  0.2),
      (null::uuid, 'archetype-bubble-tea',           'Bubble tea',                350, 60.0,  5.0, 10.0),
      (null::uuid, 'archetype-beer',                 'Beer',                      150, 12.0,  1.0,  0.0),
      (null::uuid, 'archetype-protein-shake',        'Protein shake',             200, 15.0, 25.0,  4.0),

      -- Sweets and snacks
      (null::uuid, 'archetype-cake-slice',           'Cake slice',                350, 45.0,  5.0, 17.0),
      (null::uuid, 'archetype-cookies',              'Cookies / biscuits',        150, 20.0,  2.0,  7.0),
      (null::uuid, 'archetype-ice-cream',            'Ice cream',                 250, 28.0,  4.0, 13.0),
      (null::uuid, 'archetype-kuih',                 'Local kuih',                180, 30.0,  2.0,  6.0),
      (null::uuid, 'archetype-donut-pastry',         'Donut / pastry',            300, 35.0,  5.0, 16.0),
      (null::uuid, 'archetype-chocolate',            'Chocolate bar',             250, 28.0,  3.0, 14.0),
      (null::uuid, 'archetype-chips',                'Chips / crisps',            270, 26.0,  3.0, 17.0),
      (null::uuid, 'archetype-fried-snack',          'Fried snack',               250, 28.0,  4.0, 14.0),
      (null::uuid, 'archetype-nuts',                 'Nuts, a handful',           180,  6.0,  6.0, 15.0),
      (null::uuid, 'archetype-yoghurt',              'Yoghurt',                   120, 15.0,  6.0,  4.0),
      (null::uuid, 'archetype-cereal',               'Cereal with milk',          250, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-pancakes',             'Pancakes / waffles',        350, 50.0,  8.0, 13.0),
      (null::uuid, 'archetype-fruit',                'Fruit, one serving',         90, 22.0,  1.0,  0.5)
    ) as t (id, slug, name, kcal, carbs_g, protein_g, fat_g)
  loop
    insert into public.archetypes (id, slug, name, kcal, carbs_g, protein_g, fat_g)
    values (coalesce(r.id, pg_catalog.gen_random_uuid()), r.slug, r.name,
            r.kcal, r.carbs_g, r.protein_g, r.fat_g)
    on conflict (slug) do update set
      name       = excluded.name,
      kcal       = excluded.kcal,
      carbs_g    = excluded.carbs_g,
      protein_g  = excluded.protein_g,
      fat_g      = excluded.fat_g;
  end loop;
end;
$$;

comment on function public.seed_archetype_foods is
  'Upserts the ~60 tier-5 archetype rows. Idempotent; called from a data '
  'migration and safe to re-run to correct a figure.';

revoke execute on function public.seed_archetype_foods from public, anon, authenticated;
grant execute on function public.seed_archetype_foods to service_role;
