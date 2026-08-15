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

  -- Set when this row records a fix-by-typing pass rather than a fresh scan:
  -- the user's instruction, verbatim. The eval question it answers is "what do
  -- people have to correct", which is the scan accuracy backlog sorted by pain.
  refine_instruction text check (char_length(refine_instruction) <= 500),

  -- Set when the meal was TYPED rather than photographed: the description,
  -- verbatim. The columns above are the model's reading of this sentence, and
  -- "which phrasings does it read badly" needs both halves on the row —
  -- there is no photo to go back to and look at.
  described_text text check (char_length(described_text) <= 500),

  -- Where the cascade landed. `resolved_tier` is 1..5; the food is the row the
  -- entry points at, and `catalogue_kcal` is that row's figure at the time.
  resolved_tier    smallint check (resolved_tier between 1 and 5),
  -- Unconstrained, and null whenever the cascade did not land on a catalogue
  -- row — which is every tier below the dish match. The catalogue is in another
  -- database; this is a note about where an answer came from, not a reference.
  resolved_food_id uuid,
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
-- The same backlog for packaged goods.
--
-- A barcode that resolves to nothing is a more actionable miss than a dish
-- query is: there is no ambiguity about what was wanted, the code names one
-- product exactly, and the fix is either to import it or to notice that Open
-- Food Facts does not have it either. `found` records which of those happened,
-- because "the catalogue was missing it and the live lookup filled it in" and
-- "nobody anywhere knows this packet" are different problems and only the
-- second one needs a human.
--
-- Written by the `barcode` edge function, which is the only thing that learns
-- the answer — the client's `lookup_barcode` is `stable` and cannot write.
-- ---------------------------------------------------------------------------
create table public.barcode_misses (
  id          uuid primary key default gen_random_uuid(),
  -- GTIN-14. Not a foreign key to anything: the whole point of a row here is
  -- that no food has this code.
  code        text not null check (code ~ '^[0-9]{14}$'),
  -- True when the live Open Food Facts lookup rescued it and wrote a row.
  found       boolean not null default false,
  created_at  timestamptz not null default now()
);

create index barcode_misses_code_idx on public.barcode_misses (code);

alter table public.barcode_misses enable row level security;

grant select, insert, delete on public.barcode_misses to service_role;


-- ---------------------------------------------------------------------------
-- How many packets an account has scanned in the current hour, and the ceiling.
--
-- The barcode function is the one model-adjacent path with no throttle: unlike
-- a scan or a described meal it spends no AI budget, so `claim_ai_inference`
-- never sees it, and a signed-in caller could loop distinct codes to drive a
-- live Open Food Facts fetch and a `barcode_misses` write on every one. That is
-- a denial-of-wallet rather than a data risk, so the control is a plain
-- per-account rate limit shaped exactly like the AI meter above: one row per
-- hour, an atomic claim, no client write grant.
--
-- HOURLY, not monthly. A real person scans a handful of packets in a shopping
-- trip; the ceiling only has to be far above that and far below what a script
-- can do. Fixed hour windows rather than a sliding one for the same reason the
-- AI meter uses calendar months: a window that has to be swept clean needs
-- something to sweep it, and a row keyed by the window is the same fact without
-- the sweeping.
-- ---------------------------------------------------------------------------
create table public.barcode_scan_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The start of the hour, UTC. A billing-style window, not a diary day, so it
  -- does not travel with the user's clock.
  window_start timestamptz not null,
  scans        integer not null default 0 check (scans >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, window_start)
);

create trigger barcode_scan_usage_set_updated_at
  before update on public.barcode_scan_usage
  for each row execute function public.set_updated_at();

alter table public.barcode_scan_usage enable row level security;

-- No client write grant at all, like `ai_usage`: the only writer is
-- `claim_barcode_scan`, and a client that could zero its own counter is not a
-- limit.
grant select on public.barcode_scan_usage to authenticated;
grant select, insert, update, delete on public.barcode_scan_usage to service_role;

create policy "barcode_scan_usage: read own"
  on public.barcode_scan_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.barcode_hourly_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 120;
$$;

revoke execute on function public.barcode_hourly_limit from public, anon;
grant execute on function public.barcode_hourly_limit to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Take one scan's worth of budget, or refuse. Atomic, for the reason
-- `claim_ai_inference` is: a read-then-write limit is one two requests can both
-- walk through. The guard is a `where` on the `on conflict do update`, so the
-- check and the increment are one statement under one row lock.
-- ---------------------------------------------------------------------------
create or replace function public.claim_barcode_scan(p_user uuid)
returns table (
  allowed       boolean,
  used          integer,
  hourly_limit  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  integer     := public.barcode_hourly_limit();
  v_window timestamptz := date_trunc('hour', (now() at time zone 'utc')) at time zone 'utc';
  v_used   integer;
begin
  insert into public.barcode_scan_usage as u (user_id, window_start, scans)
  values (p_user, v_window, 1)
  on conflict (user_id, window_start) do update
     set scans = u.scans + 1
   where u.scans + 1 <= v_limit
  returning u.scans into v_used;

  if v_used is null then
    select u.scans into v_used
      from public.barcode_scan_usage u
     where u.user_id = p_user and u.window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit;
    return;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

revoke execute on function public.claim_barcode_scan from public, anon, authenticated;
grant execute on function public.claim_barcode_scan to service_role;


-- ---------------------------------------------------------------------------
-- WHERE TIER 4's WRITE PATH WENT
--
-- `upsert_estimate_food` made one shared `foods` row per normalized name AND
-- size, so that two people photographing the same unlisted dish landed on one
-- estimate — and so that correcting it corrected every log that had used it.
-- That sharing was the whole argument for estimates being rows rather than
-- inline macros, and `estimate_food_backlog` ranked them by how many entries
-- referenced each, which was the catalogue-widening list.
--
-- Both are gone with the catalogue. An entry carries its own numbers now, so an
-- estimate is just numbers: the cascade writes them straight onto the row with
-- a null `food_id` and there is nothing to create, dedupe or race over.
--
-- What is lost is real and worth naming: a corrected estimate no longer
-- corrects the diaries that used it, and there is no backlog ranked by
-- reference count. `food_scan_misses` is still the catalogue-widening list,
-- and it was always the better one — it records what was ASKED FOR and not
-- found, rather than what we guessed at afterwards.
--
-- The size-in-the-identity rule that function carried is worth remembering if
-- anything like it is ever rebuilt. Dedup on the name alone made "nasi lemak"
-- one row, and a 366 kcal row is not the plate a 780 kcal photo is of: the
-- entry then had two ways to be wrong, log the reused figure and be 400 kcal
-- light, or absorb the difference into `quantity` and tell somebody they ate
-- two plates when they photographed one. Both were happening.
-- ---------------------------------------------------------------------------
