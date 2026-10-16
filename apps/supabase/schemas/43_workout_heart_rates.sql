-- ---------------------------------------------------------------------------
-- A workout's heart rate, as the Apple Watch app recorded it.
--
-- One row per workout, beside it rather than inside `save_workout`, for two
-- reasons. The trace reaches the phone after the workout often enough to
-- matter: the watch ends its session when the phone says the workout is saved,
-- and only then has a finished trace to send. And `save_workout` rewrites a
-- workout whole on every edit, which would have to carry a trace the edit
-- screen has no reason to hold.
--
-- The trace is a run of evenly spaced readings from `started_at`, one every
-- `interval_s` seconds, with null where the watch read nothing (off the wrist,
-- or a gap in the sensor). An array rather than a row a reading because a row a
-- reading is a hundred bytes of overhead around two bytes of pulse: an hour at
-- five seconds is 720 readings, about 1.5 kB here.
--
-- The phone never writes the summary figures. `save_workout_heart_rate` works
-- out the average, maximum and minimum from the trace it is given, so the
-- numbers on the workout page and the line under them cannot disagree.
-- Clients may read their own rows and write them only through the function.
-- ---------------------------------------------------------------------------

create table public.workout_heart_rates (
  workout_id   uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- When the first reading in `bpm` was taken.
  started_at   timestamptz not null,
  interval_s   smallint not null check (interval_s between 1 and 60),
  bpm          smallint[] not null,
  avg_bpm      smallint not null check (avg_bpm between 25 and 250),
  max_bpm      smallint not null check (max_bpm between 25 and 250),
  min_bpm      smallint not null check (min_bpm between 25 and 250),
  -- The watch's own measurement of the session's active energy. Not read by
  -- the budget, which hears energy only from the health store, where the
  -- watch saved the same figure.
  active_kcal  integer check (active_kcal between 0 and 10000),
  source       text not null default 'apple_watch' check (source in ('apple_watch')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A day of readings at the finest spacing, the most a workout can last.
  constraint workout_heart_rates_length check (
    cardinality(bpm) between 1 and 86400 / interval_s + 1
  ),
  -- Owned by (workout_id, user_id) for the reason the sets are: a foreign key
  -- check bypasses row security, so the id alone would let one account attach
  -- a trace to another's workout.
  constraint workout_heart_rates_workout_fkey foreign key (workout_id, user_id)
    references public.workouts (id, user_id) on delete cascade
);

create index workout_heart_rates_user_idx on public.workout_heart_rates (user_id);

create trigger workout_heart_rates_set_updated_at
  before update on public.workout_heart_rates
  for each row execute function public.set_updated_at();

alter table public.workout_heart_rates enable row level security;

grant select on public.workout_heart_rates to authenticated;
grant select, insert, update, delete on public.workout_heart_rates to service_role;

create policy "workout_heart_rates: read own"
  on public.workout_heart_rates for select
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- Saving a trace.
--
-- Answers 'saved', or 'missing' when this account has no workout under the id
-- yet. Missing is not an error: the trace often arrives while the workout is
-- still in the phone's outbox, and the phone keeps the trace and tries again
-- once the workout has landed. An error here would be class 23 and read as a
-- refusal of the trace itself.
--
-- A trace that cannot be a pulse (a reading outside 25 to 250, no reading at
-- all, a spacing outside a second to a minute) is refused as class 22, which
-- the phone treats as final.
--
-- `security definer` because clients have no write grant on the table; the
-- owner check is the first thing it does. Saving twice replaces the trace, so a
-- retry after a lost reply is harmless.
-- ---------------------------------------------------------------------------
create or replace function public.save_workout_heart_rate(p_trace jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_id        uuid;
  v_interval  integer;
  v_bpm       smallint[];
  v_avg       numeric;
  v_max       integer;
  v_min       integer;
  v_kcal      integer;
  v_health    text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_trace is null or jsonb_typeof(p_trace) <> 'object' then
    raise exception 'Expected a heart rate trace' using errcode = '22023';
  end if;
  if jsonb_typeof(p_trace -> 'bpm') is distinct from 'array' then
    raise exception 'Expected a list of readings' using errcode = '22023';
  end if;

  v_id := (p_trace ->> 'workout_id')::uuid;
  if v_id is null or p_trace ->> 'started_at' is null then
    raise exception 'Expected a workout and a start' using errcode = '22023';
  end if;
  v_interval := (p_trace ->> 'interval_s')::integer;
  if v_interval is null or v_interval not between 1 and 60 then
    raise exception 'Readings must be 1 to 60 seconds apart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_trace -> 'bpm') not between 1 and 86400 / v_interval + 1 then
    raise exception 'Too many readings for one workout' using errcode = '22023';
  end if;

  -- A null element is a gap; anything else has to be a heartbeat.
  select array_agg(
           case when jsonb_typeof(value) = 'number' then round(value::text::numeric)::smallint end
           order by ordinality
         )
    into v_bpm
    from jsonb_array_elements(p_trace -> 'bpm') with ordinality;

  select avg(b), max(b), min(b) into v_avg, v_max, v_min
    from unnest(v_bpm) as b
   where b is not null;

  if v_max is null then
    raise exception 'A trace needs a reading' using errcode = '22023';
  end if;
  if v_min < 25 or v_max > 250 then
    raise exception 'A reading is not a heartbeat' using errcode = '22003';
  end if;

  v_kcal := round((p_trace ->> 'active_kcal')::numeric)::integer;
  if v_kcal is not null and v_kcal not between 0 and 10000 then
    v_kcal := null;
  end if;
  v_health := nullif(left(p_trace ->> 'health_workout_id', 200), '');

  if not exists (select 1 from public.workouts w where w.id = v_id and w.user_id = v_user) then
    return 'missing';
  end if;

  insert into public.workout_heart_rates as h (
    workout_id, user_id, started_at, interval_s, bpm, avg_bpm, max_bpm, min_bpm, active_kcal
  )
  values (
    v_id, v_user, (p_trace ->> 'started_at')::timestamptz, v_interval, v_bpm,
    round(v_avg), v_max, v_min, v_kcal
  )
  on conflict (workout_id) do update set
    started_at = excluded.started_at,
    interval_s = excluded.interval_s,
    bpm = excluded.bpm,
    avg_bpm = excluded.avg_bpm,
    max_bpm = excluded.max_bpm,
    min_bpm = excluded.min_bpm,
    active_kcal = excluded.active_kcal
  where h.user_id = v_user;

  -- The watch saved the workout to Apple Health, so that copy is the one an
  -- iPad or an older build reading Health back must recognise as this
  -- workout. Only filled when empty: a copy the phone already wrote wins.
  if v_health is not null then
    update public.workouts w
       set health_workout_id = v_health
     where w.id = v_id and w.user_id = v_user and w.health_workout_id is null;
  end if;

  return 'saved';
end;
$$;

comment on function public.save_workout_heart_rate(jsonb) is
  'Stores the Apple Watch heart rate trace of one of the caller''s workouts, '
  'working out its average, maximum and minimum. Answers missing, rather than '
  'failing, while the workout itself has not been saved.';

revoke all on function public.save_workout_heart_rate(jsonb) from public, anon;
grant execute on function public.save_workout_heart_rate(jsonb) to authenticated;
