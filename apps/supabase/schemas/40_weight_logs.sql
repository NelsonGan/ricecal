-- ---------------------------------------------------------------------------
-- Body weight over time. The source of truth for what a user weighs, which is why
-- `profiles` has no weight column.
--
-- One row per user per day: weighing yourself twice before breakfast should not
-- draw two points on the chart, and the last reading of the day is the one a user
-- would recognise as today's weight. A second entry upserts over the first.
--
-- A row has two possible authors, and `provider` is which. Null means the user
-- typed it; a `health_provider` means it was read off Apple Health or Health
-- Connect. The distinction has to be stored rather than inferred, because the two
-- authors are not equal: see `sync_weight_readings`.
-- ---------------------------------------------------------------------------

create table public.weight_logs (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- The user's local calendar day, not the instant.
  measured_on   date not null,

  weight_kg     numeric(5, 2) not null check (weight_kg between 20 and 500),
  -- Null is unknown, never zero.
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 1 and 75),

  -- Where the reading came from. NULL is the user's own hand, and it is NOT a
  -- missing value — it is the case with the most authority, and every account
  -- that predates health syncing is correctly described by it.
  provider      public.health_provider,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (user_id, measured_on)
);

-- The chart reads a trailing range; the target recompute reads the newest row.
-- Descending so both are a forward scan of the index.
create index weight_logs_user_measured_idx
  on public.weight_logs (user_id, measured_on desc);

create trigger weight_logs_set_updated_at
  before update on public.weight_logs
  for each row execute function public.set_updated_at();

alter table public.weight_logs enable row level security;

grant select, insert, update, delete on public.weight_logs to authenticated;
grant select, insert, update, delete on public.weight_logs to service_role;

create policy "weight_logs: read own"
  on public.weight_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "weight_logs: insert own"
  on public.weight_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "weight_logs: update own"
  on public.weight_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "weight_logs: delete own"
  on public.weight_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Writing a batch of readings from a health store.
--
-- Why this is not a plain upsert from the client: one row per day and two authors
-- means the sync and the user compete for the same key, and they must not compete
-- on equal terms. A reading the user typed is never overwritten by a synced one.
-- Somebody who steps on a scale, dislikes the number and corrects it in the app
-- has said which of the two they mean, and the rolling window re-reads the last
-- seven days on every foreground, so an unguarded upsert would put the scale's
-- figure back within a minute, every minute, and the correction would look like a
-- bug in the text field.
--
-- That rule is a WHERE on the DO UPDATE, and PostgREST's upsert cannot express
-- one, which is the whole reason this function exists. `w.provider is not null`
-- reads as: overwrite only what the sync itself wrote.
--
-- Security invoker, unlike the other functions here that widen anything. It
-- widens nothing, since the client already holds insert and update on this table,
-- so RLS stays in force and the user_id comes from the caller's own token rather
-- than from an argument, which is what makes a forged user_id impossible rather
-- than merely rejected.
--
-- Out-of-range readings are dropped, not raised. `weight_kg` and `body_fat_pct`
-- carry check constraints, and a health store is perfectly capable of holding a
-- 5 kg entry somebody made while testing their scale. Letting one such sample
-- raise would abort the statement, and this runs inside the same sync pass that
-- writes activity, so a single junk row in Health would cost the user their
-- steps, their workouts and their calorie budget. A dropped reading costs them
-- one dot on the weight chart.
-- ---------------------------------------------------------------------------
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

revoke execute on function public.sync_weight_readings from public, anon;
grant execute on function public.sync_weight_readings to authenticated, service_role;
