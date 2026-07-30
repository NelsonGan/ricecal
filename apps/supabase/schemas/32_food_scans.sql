-- ---------------------------------------------------------------------------
-- The scan cascade's paper trail. Written only by the edge function, as
-- `service_role`; no client reads or writes any of this.
--
-- `food_scan_items` is the eval set: one row per item the vision model saw,
-- recording what it claimed, what the catalogue offered, and which tier the
-- cascade settled on. Every accuracy question the feature will ever face —
-- "how often does tier 1 hit", "how far off are the estimates" — is a query
-- over this table, and none of it is reconstructable after the fact.
--
-- `food_scan_misses` is the catalogue-widening backlog: every query tier 1
-- ran and got nothing usable for. The most frequent strings in it are the
-- next import batch.
-- ---------------------------------------------------------------------------

create table public.food_scan_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  scan_id          uuid not null,
  item_index       smallint not null default 0,

  -- What the vision call returned, verbatim enough to re-run resolution
  -- against a future catalogue.
  scene            text,
  specific_query   text,
  generic_query    text,
  components       jsonb,
  serving_hint     text,
  llm_kcal_low     integer,
  llm_kcal_high    integer,
  confidence       numeric(3, 2),

  -- Where the cascade landed. `resolved_tier` is 1..5; the food is the row the
  -- entry points at, and `catalogue_kcal` is that row's figure at the time —
  -- the estimate row is expected to be corrected later, and the comparison
  -- only means anything against the number that was actually accepted.
  -- Set when this row records a fix-by-typing pass rather than a fresh scan:
  -- the user's instruction, verbatim. The eval question it answers is "what do
  -- people have to correct", which is the scan accuracy backlog sorted by pain.
  refine_instruction text check (char_length(refine_instruction) <= 500),

  resolved_tier    smallint check (resolved_tier between 1 and 5),
  resolved_food_id uuid references public.foods (id) on delete set null,
  catalogue_kcal   integer,
  quantity         numeric(6, 2),
  food_log_id      uuid references public.food_logs (id) on delete set null,

  created_at       timestamptz not null default now()
);

create index food_scan_items_scan_idx on public.food_scan_items (scan_id);
create index food_scan_items_tier_idx on public.food_scan_items (resolved_tier);

alter table public.food_scan_items enable row level security;

-- service_role only. RLS stays enabled with no policies, so a grant added by
-- mistake still exposes nothing.
grant select, insert, update, delete on public.food_scan_items to service_role;


create table public.food_scan_misses (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid,
  query       text not null check (char_length(query) between 1 and 200),
  place       public.food_place,
  created_at  timestamptz not null default now()
);

-- The backlog is read as "most missed first", which is a group-by over the
-- normalized query; no index earns its keep until the table is large.
alter table public.food_scan_misses enable row level security;

grant select, insert, delete on public.food_scan_misses to service_role;


-- ---------------------------------------------------------------------------
-- Tier 4's write path: one estimate row per normalized name, made here rather
-- than in the edge function because the dedup rule IS `search_normalize`, and
-- reimplementing that in TypeScript would fork the definition. `on conflict`
-- over the partial unique index turns two users estimating the same dish
-- concurrently into one shared row instead of a race.
--
-- Existing macros are NOT updated on conflict: the row may have been corrected
-- by a curator since it was first written, and a later scan's opinion must not
-- undo that. What it gets is reused, which is the point.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_estimate_food(
  p_name      text,
  p_kcal      integer,
  p_carbs_g   numeric,
  p_protein_g numeric,
  p_fat_g     numeric,
  p_fibre_g   numeric default null,
  p_sugar_g   numeric default null,
  p_sodium_mg integer default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_norm text := public.search_normalize(p_name);
  v_id   uuid;
begin
  if v_norm = '' then
    raise exception 'estimate name normalizes to nothing usable';
  end if;

  select f.id into v_id from public.foods f
  where f.is_estimate and f.name_norm = v_norm;

  if v_id is null then
    insert into public.foods
      (slug, name, place, kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g,
       sodium_mg, verified, is_estimate, source)
    values
      ('estimate-' || replace(v_norm, ' ', '-'),
       left(trim(p_name), 120), 'home',
       p_kcal, p_carbs_g, p_protein_g, p_fat_g, p_fibre_g, p_sugar_g,
       p_sodium_mg, false, true, 'llm estimate')
    on conflict (name_norm) where is_estimate do nothing
    returning id into v_id;

    -- Lost the race, or the slug collided with a differently-spelled name that
    -- normalizes the same: either way the row exists now, so reuse it.
    if v_id is null then
      select f.id into v_id from public.foods f
      where f.is_estimate and f.name_norm = v_norm;
    end if;

    if v_id is not null then
      insert into public.food_servings (food_id, slug, label, factor, is_default, position)
      values (v_id, 'serving', '1 serving', 1.0, true, 0)
      on conflict (food_id, slug) do nothing;
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.upsert_estimate_food is
  'Reuse-or-create a tier-4 estimate row, deduped on the normalized name. '
  'Returns the food id. service_role only.';

revoke execute on function public.upsert_estimate_food from public, anon, authenticated;
grant execute on function public.upsert_estimate_food to service_role;


-- ---------------------------------------------------------------------------
-- The curation backlog: estimate rows ranked by how many entries reference
-- them. The top of this list is the estimate most worth replacing with a real
-- catalogue row — correcting it corrects every log that used it, which is the
-- whole reason estimates are shared rows rather than inline macros.
-- ---------------------------------------------------------------------------
create or replace function public.estimate_food_backlog(p_limit integer default 100)
returns table (
  food_id    uuid,
  name       text,
  kcal       integer,
  log_count  bigint,
  last_used  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    f.id,
    f.name,
    f.kcal,
    count(e.id) as log_count,
    max(e.logged_at) as last_used
  from public.foods f
  left join public.food_logs e on e.food_id = f.id
  where f.is_estimate
  group by f.id, f.name, f.kcal
  order by count(e.id) desc, max(e.logged_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

comment on function public.estimate_food_backlog is
  'Estimate rows ranked by referencing log count — the catalogue-widening '
  'backlog. service_role only.';

revoke execute on function public.estimate_food_backlog from public, anon, authenticated;
grant execute on function public.estimate_food_backlog to service_role;
