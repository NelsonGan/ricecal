-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.sync_weight_readings (
  p_provider public.health_provider,
  p_readings jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
    where w.provider is not null
      -- And only when the reading differs. The app sends its last seven days
      -- on every foreground, nearly always the figures already here, and an
      -- update that changes nothing still writes a new row version and still
      -- fires `weight_logs_sync_daily_goals`, which recomputes the budget and
      -- rewrites today's `daily_goals` row once per reading. So the count this
      -- returns is of readings that changed something, not of readings sent.
      and (w.weight_kg, w.body_fat_pct, w.provider)
        is distinct from (excluded.weight_kg, excluded.body_fat_pct, excluded.provider);

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;