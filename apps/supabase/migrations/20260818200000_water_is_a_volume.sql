-- ---------------------------------------------------------------------------
-- Water becomes a volume: `water_glasses` -> `water_ml`, in both tables.
--
-- HAND-EDITED, and this is the reason. `db diff` writes a rename it cannot see
-- as a rename: it drops the old column and adds the new one, which throws away
-- every day of water anybody has logged. What is here instead renames the
-- column and converts it in place, at 250 ml a glass — the size the tracker was
-- drawing, and the size that makes the old default of eight glasses come out as
-- the new default of 2,000 ml, so nobody's goal moves by being converted.
--
-- The rest of the file is the generator's own output, in its own order, minus
-- the two DROP COLUMNs and the two ADD COLUMNs that would have replaced them.
-- `check_function_bodies = false` is what lets the functions be recreated
-- before the view they read is back.
--
-- The revokes at the foot are hand-written too, and they are not decoration:
-- `db diff` does not report grant deltas, and a freshly created function is
-- EXECUTE-able by PUBLIC until something says otherwise. Both functions here
-- were dropped and recreated, so both need theirs restated.
-- ---------------------------------------------------------------------------

SET check_function_bodies = false;

DROP FUNCTION public.review_days(IN p_from date, IN p_to date, IN p_user_id uuid);

DROP FUNCTION public.trend_days(IN p_range text, IN p_user_id uuid);

DROP VIEW public.current_daily_goals;

-- A day's water. The check has to go before the type change, or the old
-- 0..60 bound is re-evaluated against a figure now in the hundreds.
ALTER TABLE public.daily_logs
  DROP CONSTRAINT daily_logs_water_glasses_check;

ALTER TABLE public.daily_logs
  RENAME COLUMN water_glasses TO water_ml;

ALTER TABLE public.daily_logs
  ALTER COLUMN water_ml DROP DEFAULT,
  ALTER COLUMN water_ml TYPE integer USING (water_ml::integer * 250),
  ALTER COLUMN water_ml SET DEFAULT 0;

-- The goal. Eight glasses becomes 2,000 ml, thirty becomes 7,500 — every value
-- the old check allowed lands inside the new one, so nothing has to be clamped.
ALTER TABLE public.daily_goals
  DROP CONSTRAINT daily_goals_water_glasses_check;

ALTER TABLE public.daily_goals
  RENAME COLUMN water_glasses TO water_ml;

ALTER TABLE public.daily_goals
  ALTER COLUMN water_ml DROP DEFAULT,
  ALTER COLUMN water_ml TYPE integer USING (water_ml::integer * 250),
  ALTER COLUMN water_ml SET DEFAULT 2000;

CREATE FUNCTION public.add_water (
  p_ml   integer,
  p_date date    DEFAULT NULL::date
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user  uuid := (select auth.uid());
  v_date  date := coalesce(p_date, public.local_today(v_user));
  v_total integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.daily_logs as l (user_id, log_date, water_ml)
  values (v_user, v_date, greatest(0, least(20000, p_ml)))
  on conflict (user_id, log_date) do update
    set water_ml = greatest(0, least(20000, l.water_ml + p_ml))
  returning l.water_ml into v_total;

  return v_total;
end;
$function$;

COMMENT ON FUNCTION public.add_water(integer,date) IS 'Adds p_ml millilitres of water to a day and returns the day''s new total. Negative amounts take water back. The total is clamped to 0..20000 rather than checked, so neither an undo nor a fat-fingered custom amount errors.';

GRANT ALL ON FUNCTION public.add_water(integer, date) TO authenticated;

CREATE FUNCTION public.review_days (
  p_from    date,
  p_to      date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at               date,
    kcal             integer,
    carbs_g          numeric,
    protein_g        numeric,
    fat_g            numeric,
    entry_count      integer,
    water_ml         integer,
    goal_kcal        integer,
    goal_water       integer,
    weight_kg        numeric,
    has_activity     boolean,
    active_kcal      integer,
    resting_kcal     integer,
    steps            integer,
    distance_m       integer,
    exercise_minutes integer,
    step_goal        integer,
    sessions         integer,
    session_kcal     integer,
    session_seconds  integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with calendar as (
    select series::date as at
    from generate_series(p_from, p_to, interval '1 day') as series
  ),
  -- One current preference rather than an effective-dated one, so it is read
  -- once and joined as a constant. Same treatment as `activity_days_range`.
  prefs as (
    select coalesce(
      (select s.step_goal from public.user_settings s where s.user_id = p_user_id),
      8000
    ) as step_goal
  )
  select
    c.at,
    n.kcal,
    n.carbs_g,
    n.protein_g,
    n.fat_g,
    coalesce(n.entry_count, 0),
    coalesce(l.water_ml, 0)::integer,
    g.kcal,
    g.water_ml::integer,
    w.weight_kg,
    (a.user_id is not null),
    coalesce(a.active_kcal, 0),
    a.resting_kcal,
    coalesce(a.steps, 0),
    a.distance_m,
    a.exercise_minutes,
    p.step_goal,
    coalesce(s.sessions, 0),
    coalesce(s.session_kcal, 0),
    coalesce(s.session_seconds, 0)
  from calendar c
  cross join prefs p
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
  left join public.daily_logs      l on l.user_id = p_user_id and l.log_date    = c.at
  left join public.weight_logs     w on w.user_id = p_user_id and w.measured_on = c.at
  left join public.activity_days   a on a.user_id = p_user_id and a.log_date    = c.at
  left join lateral (
    select
      count(*)::integer           as sessions,
      sum(v.active_kcal)::integer as session_kcal,
      sum(v.duration_s)::integer  as session_seconds
    from public.activity_sessions v
    where v.user_id = p_user_id and v.log_date = c.at
  ) s on true
  left join lateral (
    select gg.kcal, gg.water_ml
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

COMMENT ON FUNCTION public.review_days(date,date,uuid) IS 'One row per calendar day between two dates, carrying that day''s food, water, weigh-in, budget and movement. The generator every review function folds; days with nothing logged are present and empty.';

GRANT ALL ON FUNCTION public.review_days(date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_summary (
  p_kind    text,
  p_start   date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    kind               text,
    starts_on          date,
    ends_on            date,
    days               integer,
    days_logged        integer,
    days_under_goal    integer,
    streak_days        integer,
    kcal_avg           numeric,
    kcal_goal          integer,
    carbs_g_avg        numeric,
    protein_g_avg      numeric,
    fat_g_avg          numeric,
    lightest_on        date,
    lightest_kcal      integer,
    heaviest_on        date,
    heaviest_kcal      integer,
    water_avg          numeric,
    water_goal_days    integer,
    weight_last        numeric,
    weight_change      numeric,
    weigh_ins          integer,
    active_days        integer,
    active_kcal_avg    numeric,
    steps_avg          numeric,
    step_goal_days     integer,
    step_goal          integer,
    distance_total_m   integer,
    exercise_min_total integer,
    sessions           integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  days as (
    select d.* from span s cross join lateral public.review_days(s.from_date, s.to_date, p_user_id) d
  ),
  before as (
    select w.weight_kg
    from public.weight_logs w
    where w.user_id = p_user_id and w.measured_on < p_start
    order by w.measured_on desc
    limit 1
  ),
  -- The run of consecutive logged days ending on the last day of the period,
  -- counted back past its start. Gaps and islands, as in `logging_streak()`,
  -- and deliberately AS THE PERIOD ENDED rather than as of today: a review of
  -- August should not quote a streak that only began in September.
  logged as (
    select distinct e.log_date
    from public.food_logs e, span s
    where e.user_id = p_user_id and e.log_date <= s.to_date
  ),
  islands as (
    select l.log_date, l.log_date - (row_number() over (order by l.log_date))::integer as island
    from logged l
  ),
  streak as (
    select coalesce(count(*), 0)::integer as days
    from islands i, span s
    where i.island = (select j.island from islands j, span s2 where j.log_date = s2.to_date)
      and i.log_date <= s.to_date
  )
  select
    p_kind,
    min(d.at),
    max(d.at),
    count(*)::integer,
    (count(*) filter (where d.entry_count > 0))::integer,
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    (select st.days from streak st),

    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    (array_agg(d.goal_kcal order by d.at desc))[1],
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    -- Ties go to the earlier day, on both. Two days at the same figure is one
    -- story about the day it first happened, not about the last time it did.
    (array_agg(d.at   order by d.kcal asc,  d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.kcal order by d.kcal asc,  d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.at   order by d.kcal desc, d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.kcal order by d.kcal desc, d.at) filter (where d.entry_count > 0))[1],

    -- Averaged over every day, unlike the calorie figures. A day nobody logged
    -- water on is a day they recorded none, and a hydration average that
    -- skipped it would only ever describe the days that went well. Whole
    -- millilitres: a tenth of one is not a fact about anybody's day.
    round(avg(d.water_ml), 0),
    (count(*) filter (where d.water_ml >= coalesce(d.goal_water, 2000)))::integer,

    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    -- One reading and nothing before it is not a change of zero: the fallback
    -- would subtract that reading from itself. Same rule, and the same reason,
    -- as the one written out in `review_periods`.
    case
      when count(d.weight_kg) = 0 then null
      when count(d.weight_kg) = 1 and (select b.weight_kg from before b) is null then null
      else (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1]
         - coalesce(
             (select b.weight_kg from before b),
             (array_agg(d.weight_kg order by d.at) filter (where d.weight_kg is not null))[1]
           )
    end,
    count(d.weight_kg)::integer,

    (count(*) filter (where d.has_activity))::integer,
    round(avg(d.active_kcal) filter (where d.has_activity), 0),
    round(avg(d.steps)       filter (where d.has_activity), 0),
    (count(*) filter (where d.steps >= d.step_goal))::integer,
    (array_agg(d.step_goal order by d.at desc))[1],
    sum(d.distance_m)::integer,
    sum(d.exercise_minutes)::integer,
    sum(d.sessions)::integer
  from days d;
$function$;

CREATE OR REPLACE FUNCTION public.sync_daily_goals()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user_id  uuid;
  v_profile  public.profiles%rowtype;
  v_weight   numeric;
  v_today    date;
  v_current  public.daily_goals%rowtype;
  v_computed record;
begin
  -- Attached to two tables whose owner columns are named differently, and to
  -- DELETE where there is no NEW row.
  --
  -- This is an IF and not a CASE expression on purpose. PL/pgSQL resolves the
  -- field references in EVERY branch of a CASE, so `case … then new.id else
  -- new.user_id end` fails with `record "new" has no field "user_id"` while
  -- firing on `profiles` — the branch it never takes is what breaks it. The
  -- branches of an IF are separate statements and only the taken one is
  -- evaluated.
  --
  -- Likewise `coalesce(new, old)`: OLD is unassigned during INSERT, and
  -- touching it raises rather than returning null.
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  elsif tg_table_name = 'profiles' then
    v_user_id := new.id;
  else
    v_user_id := new.user_id;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  -- Onboarding fills the profile one screen at a time, so most of these calls
  -- happen before there is enough to compute anything. Returning quietly is
  -- correct: the write that completes the set will fire this again.
  if v_profile.id is null
     or v_profile.sex is null
     or v_profile.birth_date is null
     or v_profile.height_cm is null then
    return null;
  end if;

  v_weight := public.current_weight_kg(v_user_id);
  if v_weight is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'Asia/Kuala_Lumpur'))::date;

  select * into v_current
  from public.daily_goals
  where user_id = v_user_id and effective_from <= v_today
  order by effective_from desc
  limit 1;

  if coalesce(v_current.is_custom, false) then
    return null;
  end if;

  -- Target weight is NOT in the guard above, and that is deliberate: it is
  -- nullable, a null means "never stated", and `compute_targets` reads that as
  -- maintenance. Requiring it here would leave every account that predates it
  -- with no budget at all rather than with a flat one.
  select * into v_computed
  from public.compute_targets(
    v_profile.sex,
    v_profile.birth_date,
    v_profile.height_cm,
    v_weight,
    v_profile.activity_level,
    v_profile.target_weight_kg
  );

  -- Written against today, not against the row that is currently in force.
  -- A new budget applies from now on; yesterday was still measured against
  -- yesterday's target, which is the entire point of the effective_from key.
  --
  -- Water is carried forward rather than recomputed: it is not derived from
  -- body stats, and resetting it to the default on every profile edit would
  -- quietly undo a user's own choice.
  insert into public.daily_goals as g (
    user_id, effective_from, kcal, carbs_g, protein_g, fat_g,
    water_ml, is_custom
  )
  values (
    v_user_id, v_today,
    v_computed.kcal, v_computed.carbs_g, v_computed.protein_g, v_computed.fat_g,
    coalesce(v_current.water_ml, 2000),
    false
  )
  on conflict (user_id, effective_from) do update
    set kcal      = excluded.kcal,
        carbs_g   = excluded.carbs_g,
        protein_g = excluded.protein_g,
        fat_g     = excluded.fat_g
    where not g.is_custom;

  return null;
end;
$function$;

CREATE FUNCTION public.trend_days (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at          date,
    bucket      date,
    kcal        integer,
    carbs_g     numeric,
    protein_g   numeric,
    fat_g       numeric,
    entry_count integer,
    water_ml    integer,
    goal_kcal   integer,
    goal_water  integer,
    weight_kg   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      case p_range
        -- Seven days including today, so the strip reads M..S and ends on now.
        when '7d'  then public.local_today(p_user_id) - 6
        when '30d' then public.local_today(p_user_id) - 29
        -- Twelve CALENDAR months, which is what "Last 12 months" means and what
        -- makes the axis read A S O N D J F M A M J J. `today - 364` would put
        -- two part-months at the ends and thirteen labels on the axis.
        when '1y'  then (date_trunc('month', public.local_today(p_user_id)) - interval '11 months')::date
      end as from_date,
      public.local_today(p_user_id) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case p_range
        when '1y'  then date_trunc('month', series)::date
        -- Seven-day blocks counted BACK from today, not ISO weeks. Thirty days
        -- of ISO weeks is five or six groups depending on which weekday today
        -- is, and a chart whose column count moves with the day of the week is
        -- a chart nobody can label. This is always five, and the oldest one is
        -- short.
        when '30d' then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  )
  select
    c.at,
    c.in_bucket,
    n.kcal,
    n.carbs_g,
    n.protein_g,
    n.fat_g,
    -- Zero, not null: "did this day have food logged" is asked by every count
    -- downstream, and one spelling of it beats each caller coalescing.
    coalesce(n.entry_count, 0),
    coalesce(l.water_ml, 0)::integer,
    g.kcal,
    g.water_ml::integer,
    w.weight_kg
  from calendar c
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
  left join public.daily_logs      l on l.user_id = p_user_id and l.log_date    = c.at
  left join public.weight_logs     w on w.user_id = p_user_id and w.measured_on = c.at
  left join lateral (
    select gg.kcal, gg.water_ml
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

COMMENT ON FUNCTION public.trend_days(text,uuid) IS 'One row per calendar day in a named trend range (7d, 30d, 1y), with that day''s food totals, water, effective goals and weigh-in. Days with nothing logged are present and empty, because every "N of 30" on the Trends screen counts over the range rather than over the rows.';

GRANT ALL ON FUNCTION public.trend_days(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trend_series (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    bucket_start      date,
    bucket_end        date,
    days              integer,
    kcal_avg          numeric,
    carbs_g_avg       numeric,
    protein_g_avg     numeric,
    fat_g_avg         numeric,
    days_logged       integer,
    kcal_goal         integer,
    days_under_goal   integer,
    water_avg         numeric,
    water_total       integer,
    water_best        integer,
    water_goal_days   integer,
    water_habit_days  integer,
    water_logged_days integer,
    water_goal        integer,
    weight_avg        numeric,
    weight_last       numeric,
    weight_min        numeric,
    weigh_ins         integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    d.bucket,
    max(d.at),
    count(*)::integer,
    -- Averaged over the days that HAVE food, not over the range. A week with
    -- two days logged averaged over seven reads as a starvation week.
    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    (count(*) filter (where d.entry_count > 0))::integer,
    (array_agg(d.goal_kcal order by d.at desc))[1],
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    -- Water IS averaged over the whole bucket. An unlogged day is a day you
    -- drank nothing you recorded, and a hydration average that skipped it would
    -- only ever describe the days that went well. Whole millilitres: a tenth of
    -- one is not a fact about anybody's day.
    round(avg(d.water_ml), 0),
    sum(d.water_ml)::integer,
    max(d.water_ml)::integer,
    (count(*) filter (where d.water_ml >= coalesce(d.goal_water, 2000)))::integer,
    -- Three quarters of that day's own goal, rounded up: 2,000 ml becomes
    -- 1,500. Counted per DAY and therefore here rather than in
    -- the client, which on the thirty-day range only has weekly buckets and
    -- could ask no better question than "did the whole WEEK average above the
    -- line" — which answers 0 of 30 for a month containing several full days.
    (count(*) filter (
      where d.water_ml >= ceil(coalesce(d.goal_water, 2000) * 0.75)
    ))::integer,
    (count(*) filter (where d.water_ml > 0))::integer,
    (array_agg(coalesce(d.goal_water, 2000) order by d.at desc))[1],
    round(avg(d.weight_kg), 1),
    -- The newest reading in the bucket, which is the point the line joins. A
    -- month's average is the honest summary but the line has to end where the
    -- scale last did.
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    min(d.weight_kg),
    count(d.weight_kg)::integer
  from public.trend_days(p_range, p_user_id) d
  group by d.bucket
  order by d.bucket;
$function$;

CREATE OR REPLACE FUNCTION public.trend_summary (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    from_date         date,
    to_date           date,
    days              integer,
    kcal_avg          numeric,
    carbs_g_avg       numeric,
    protein_g_avg     numeric,
    fat_g_avg         numeric,
    days_logged       integer,
    kcal_goal         integer,
    days_under_goal   integer,
    water_avg         numeric,
    water_total       integer,
    water_best        integer,
    water_goal_days   integer,
    water_habit_days  integer,
    water_logged_days integer,
    water_goal        integer,
    weight_before     numeric,
    weight_first      numeric,
    weight_last       numeric,
    weight_avg        numeric,
    weight_peak       numeric,
    weight_peak_on    date,
    weigh_ins         integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    min(d.at),
    max(d.at),
    count(*)::integer,
    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    (count(*) filter (where d.entry_count > 0))::integer,
    (array_agg(d.goal_kcal order by d.at desc))[1],
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    -- Whole millilitres. A tenth of a millilitre is not a fact about
    -- anybody's day, and it would print as one.
    round(avg(d.water_ml), 0),
    sum(d.water_ml)::integer,
    max(d.water_ml)::integer,
    (count(*) filter (where d.water_ml >= coalesce(d.goal_water, 2000)))::integer,
    (count(*) filter (
      where d.water_ml >= ceil(coalesce(d.goal_water, 2000) * 0.75)
    ))::integer,
    (count(*) filter (where d.water_ml > 0))::integer,
    (array_agg(coalesce(d.goal_water, 2000) order by d.at desc))[1],
    -- The newest reading from BEFORE the range, which is where the chart's line
    -- starts. Without it a range that opens on an unweighed day has nothing to
    -- carry forward and the line begins partway across, reading as missing data
    -- rather than as a week that started where the last one left off. Null only
    -- when there is genuinely no earlier weigh-in.
    (select w.weight_kg
       from public.weight_logs w
      where w.user_id = p_user_id and w.measured_on < min(d.at)
      order by w.measured_on desc
      limit 1),
    (array_agg(d.weight_kg order by d.at)      filter (where d.weight_kg is not null))[1],
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    round(avg(d.weight_kg), 1),
    max(d.weight_kg),
    -- The heaviest reading and the day it was taken, which is what the line
    -- chart's subtitle names. Ties go to the earlier day: the sentence is about
    -- where the range started from, not where it last matched it.
    (array_agg(d.at order by d.weight_kg desc, d.at) filter (where d.weight_kg is not null))[1],
    count(d.weight_kg)::integer
  from public.trend_days(p_range, p_user_id) d;
$function$;

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_water_ml_check CHECK (water_ml >= 250 AND water_ml <= 8000);

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_water_ml_check CHECK (water_ml >= 0 AND water_ml <= 20000);

CREATE VIEW public.current_daily_goals WITH (security_invoker=on) AS SELECT DISTINCT ON (user_id) user_id,
    effective_from,
    kcal,
    carbs_g,
    protein_g,
    fat_g,
    water_ml,
    is_custom
   FROM public.daily_goals g
  WHERE (effective_from <= public.local_today(user_id))
  ORDER BY user_id, effective_from DESC;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.current_daily_goals TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.current_daily_goals TO service_role;

-- Restated by hand: see the note at the top. `add_water` is new and
-- `review_days` was recreated, and both would otherwise be reachable by PUBLIC.
REVOKE ALL ON FUNCTION public.add_water(integer, date) FROM public;

REVOKE EXECUTE ON FUNCTION public.review_days(date, date, uuid) FROM public, anon;
