-- ---------------------------------------------------------------------------
-- The catalogue import loader.
--
-- Migrations own structure; this owns rows. A multi-gigabyte COPY in the
-- migration chain would make `db:reset` and CI unusable, so the catalogue
-- arrives here instead — deliberately, and documented in supabase/README.md.
--
-- Input is two CSVs produced by the ricecal-food-database project:
--
--     uv run --project ../ricecal-food-database  # see its scripts/export_for_ricecal.sql
--
-- and it expects them at /tmp/xfer_foods.csv and /tmp/xfer_servings.csv.
--
--     psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/import-catalogue.sql
--
-- Idempotent. `foods.id` is a UUIDv5 over (source, source key) in the upstream
-- project, so re-running updates rows in place rather than duplicating them, and
-- a `food_log` written against a dish survives a re-import.
--
-- One case it does not cover: re-importing a payload whose *slugs* changed while
-- the ids did not. `slug` is unique, and the rows are updated in one statement,
-- so a slug moving from one id to another collides mid-statement and aborts with
-- `foods_slug_key`. That is a change in how the exporter names things, which is
-- rare and loud; run `db:reset` first when it happens rather than teaching this
-- script to shuffle slugs around.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

\timing on

-- Loading as the role the app's grants actually name, rather than as the owner.
-- If a grant is missing this fails here instead of on the first cloud run.
set role service_role;

set maintenance_work_mem = '256MB';
set synchronous_commit = off;


-- ---------------------------------------------------------------------------
-- Staging
-- ---------------------------------------------------------------------------
-- Loaded to a staging table first so the whole payload can be validated against
-- every constraint in one pass. Copying straight into `foods` would surface one
-- violating row per attempt, and at half a million rows that is a very long way
-- to discover a bad column mapping.

-- `on commit drop` is only meaningful inside a transaction block; outside one
-- each statement commits itself and the staging table would vanish before the
-- copy into it.
begin;

create temp table stage_foods (
  id          uuid,
  slug        text,
  name        text,
  brand       text,
  icon_set    text,
  icon_name   text,
  place       text,
  kcal        integer,
  carbs_g     numeric,
  protein_g   numeric,
  fat_g       numeric,
  fibre_g     numeric,
  sugar_g     numeric,
  sodium_mg   integer,
  verified    boolean,
  source      text,
  search_text text
) on commit drop;

create temp table stage_servings (
  food_id     uuid,
  slug        text,
  label       text,
  factor      numeric,
  is_default  boolean,
  position    smallint
) on commit drop;

\copy stage_foods    from '/tmp/xfer_foods.csv'    with (format csv, header true)
\copy stage_servings from '/tmp/xfer_servings.csv' with (format csv, header true)

-- An icon column that arrived as `""` is not an icon. COPY reads an unquoted
-- empty CSV field as NULL but a quoted one as the empty string, which no exporter
-- controls reliably — and `('' , '')` passes both-or-neither while writing a
-- lookup that resolves to no drawing at all: a blank square on the row.
update stage_foods
   set icon_set  = nullif(btrim(icon_set), ''),
       icon_name = nullif(btrim(icon_name), '');


-- ---------------------------------------------------------------------------
-- Validate before writing
-- ---------------------------------------------------------------------------

do $$
declare n bigint;
begin
  select count(*) into n from stage_foods
   where id is null or slug is null or name is null
      or place is null or kcal is null;
  if n > 0 then raise exception '% rows missing a required value', n; end if;

  -- An icon is NOT a required value, and demanding one here is what put the same
  -- drawing on a thousand different dishes: the columns went nullable when
  -- `foods_icon_complete` replaced `icon_name not null`, but this check did not,
  -- so an exporter with nothing to name had to name something anyway. Both
  -- together or neither is the only rule.
  select count(*) into n from stage_foods
   where (icon_set is null) <> (icon_name is null);
  if n > 0 then raise exception '% rows with half an icon', n; end if;

  select count(*) into n from stage_foods
   where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
  if n > 0 then raise exception '% slugs fail the foods_slug check', n; end if;

  select count(*) - count(distinct slug) into n from stage_foods;
  if n > 0 then raise exception '% duplicate slugs in the payload', n; end if;

  select count(*) into n from stage_foods
   where char_length(trim(name)) not between 1 and 120;
  if n > 0 then raise exception '% names outside 1..120', n; end if;

  select count(*) into n from stage_foods where kcal not between 0 and 10000;
  if n > 0 then raise exception '% kcal outside 0..10000', n; end if;

  select count(*) into n from stage_foods
   where place not in (select unnest(enum_range(null::public.food_place))::text);
  if n > 0 then raise exception '% rows with a place outside the enum', n; end if;

  select count(*) into n from stage_foods
   where icon_set not in (select unnest(enum_range(null::public.icon_set))::text);
  if n > 0 then raise exception '% rows with an icon_set outside the enum', n; end if;

  select count(*) into n from stage_servings s
   left join stage_foods f on f.id = s.food_id where f.id is null;
  if n > 0 then raise exception '% servings with no food in the payload', n; end if;

  select count(*) into n from stage_servings
   where factor is null or factor <= 0 or factor > 100;
  if n > 0 then raise exception '% factors outside (0,100]', n; end if;

  select count(*) into n from (
    select food_id from stage_servings where is_default
     group by food_id having count(*) <> 1
  ) x;
  if n > 0 then raise exception '% foods without exactly one default serving', n; end if;

  raise notice 'payload validated: % foods, % servings',
    (select count(*) from stage_foods), (select count(*) from stage_servings);
end $$;


-- ---------------------------------------------------------------------------
-- Load
-- ---------------------------------------------------------------------------
-- Servings first out, foods second: `food_servings.food_id` cascades, but the
-- composite key `food_logs` carries is `on delete restrict`, so a serving in use
-- must be updated rather than replaced.

insert into public.foods as f (
  id, slug, name, brand, icon_set, icon_name, place,
  kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
  verified, source, search_text
)
select
  id, slug, name, brand, icon_set::public.icon_set, icon_name,
  place::public.food_place,
  kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
  verified, source, search_text
from stage_foods
on conflict (id) do update set
  slug        = excluded.slug,
  name        = excluded.name,
  brand       = excluded.brand,
  icon_set    = excluded.icon_set,
  icon_name   = excluded.icon_name,
  place       = excluded.place,
  kcal        = excluded.kcal,
  carbs_g     = excluded.carbs_g,
  protein_g   = excluded.protein_g,
  fat_g       = excluded.fat_g,
  fibre_g     = excluded.fibre_g,
  sugar_g     = excluded.sugar_g,
  sodium_mg   = excluded.sodium_mg,
  verified    = excluded.verified,
  source      = excluded.source,
  search_text = excluded.search_text;

-- `(food_id, slug)` is the stable handle, so a re-import moves an existing
-- serving's factor instead of orphaning the entries pointing at its id.
insert into public.food_servings as s (food_id, slug, label, factor, is_default, position)
select food_id, slug, label, factor, is_default, position
from stage_servings
on conflict (food_id, slug) do update set
  label      = excluded.label,
  factor     = excluded.factor,
  is_default = excluded.is_default,
  position   = excluded.position;

commit;


-- ---------------------------------------------------------------------------
-- After
-- ---------------------------------------------------------------------------
-- The planner has no statistics for half a million rows it has never seen, and
-- without them `search_foods` picks a sequential scan over the GIN indexes.

reset role;
analyze public.foods;
analyze public.food_servings;

select
  (select count(*) from public.foods)         as foods,
  (select count(*) from public.food_servings) as servings,
  (select count(*) from public.foods where search_text = '') as unsearchable;
