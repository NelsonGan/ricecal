-- Weigh-ins can now come from Apple Health or Health Connect as well as from
-- the user's own hand, and the two are not equal: a reading somebody typed is
-- never overwritten by a synced one.
--
-- `provider` is what tells them apart, and NULL is the typed case — which is
-- also every row that already exists, correctly, with no backfill.
--
-- The function body below is copied VERBATIM out of
-- `schemas/40_weight_logs.sql`, comments and all. Postgres stores `prosrc`
-- exactly as written and `db diff` compares the comment text too, so a
-- migration that restates a function with the prose trimmed declares a
-- function no migration produces and the `migrations` job fails on a change
-- that is genuinely captured.

alter table public.weight_logs
  add column provider public.health_provider;

create or replace function public.sync_weight_readings(
  p_provider public.health_provider,
  p_readings jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_written integer;
begin
  if p_provider is null then
    raise exception 'a synced reading must name its provider';
  end if;

  with parsed as (
    select
      (r->>'measured_on')::date  as measured_on,
      (r->>'weight_kg')::numeric as weight_kg,
      -- Kept only when it is a figure the column would accept. A store that
      -- reports body fat as a fraction, or not at all, leaves the weight
      -- usable: an absent key is null, and null through `between` is null, so
      -- both the missing and the implausible fall out here rather than at the
      -- constraint.
      case
        when (r->>'body_fat_pct')::numeric between 1 and 75
        then (r->>'body_fat_pct')::numeric
      end                        as body_fat_pct,
      ord
    from jsonb_array_elements(p_readings) with ordinality as t(r, ord)
  ),
  -- One row per day, last one in the array winning.
  --
  -- The client already picks the last reading of each day, so this looks like
  -- belt and braces. It is not: ON CONFLICT meeting the same key twice in one
  -- statement raises "cannot affect row a second time", which aborts the whole
  -- sync — the exact failure the dropped-not-raised rule above exists to
  -- prevent. A guarantee that costs a sort belongs on this side of the wire.
  chosen as (
    select distinct on (measured_on) measured_on, weight_kg, body_fat_pct
    from parsed
    where weight_kg between 20 and 400
    order by measured_on, ord desc
  )
  insert into public.weight_logs as w (
    user_id, measured_on, weight_kg, body_fat_pct, provider
  )
  select auth.uid(), measured_on, weight_kg, body_fat_pct, p_provider
  from chosen
  on conflict (user_id, measured_on) do update
    set weight_kg    = excluded.weight_kg,
        body_fat_pct = excluded.body_fat_pct,
        provider     = excluded.provider
    -- The whole point. A row the user typed has `provider` null and is left
    -- exactly as it is; a row a previous sync wrote is refreshed.
    where w.provider is not null;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

comment on function public.sync_weight_readings is
  'Write weigh-ins read from a health store. Never overwrites a reading the '
  'user typed by hand, and drops readings the column checks would reject '
  'rather than failing the sync around them.';

-- Spelled out rather than left at the default, because the default is PUBLIC
-- and `db diff` does not carry function grants — see the note in
-- `schemas/02_functions.sql`.
revoke execute on function public.sync_weight_readings from public, anon;
grant execute on function public.sync_weight_readings to authenticated, service_role;
