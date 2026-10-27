-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP INDEX public.blocked_authors_user_idx;

DROP INDEX public.daily_goals_user_effective_idx;

DROP INDEX public.food_scan_items_tier_idx;

DROP INDEX public.weight_logs_user_measured_idx;

CREATE OR REPLACE FUNCTION public.activity_days_range (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at                date,
    bucket            date,
    has_data          boolean,
    active_kcal       integer,
    resting_kcal      integer,
    steps             integer,
    distance_m        integer,
    exercise_minutes  integer,
    stand_hours       smallint,
    move_goal_kcal    integer,
    exercise_goal_min integer,
    stand_goal_hr     smallint,
    step_goal         integer,
    sessions          integer,
    session_kcal      integer,
    session_seconds   integer,
    eaten_kcal        integer,
    goal_kcal         integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      case p_range
        when '7d'  then public.local_today(p_user_id) - 6
        when '30d' then public.local_today(p_user_id) - 29
        when '1y'  then (date_trunc('month', public.local_today(p_user_id)) - interval '11 months')::date
      end as from_date,
      public.local_today(p_user_id) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case p_range
        when '1y'  then date_trunc('month', series)::date
        when '30d' then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  ),
  -- The step goal is a single current preference rather than an effective-dated
  -- one, unlike the calorie budget. Read once here so the join below is a
  -- constant and not a lookup per day.
  prefs as (
    select coalesce(
      (select s.step_goal from public.user_settings s where s.user_id = p_user_id),
      8000
    ) as step_goal
  )
  select
    c.at,
    c.in_bucket,
    (a.user_id is not null),
    coalesce(a.active_kcal, 0),
    a.resting_kcal,
    coalesce(a.steps, 0),
    a.distance_m,
    a.exercise_minutes,
    a.stand_hours,
    a.move_goal_kcal,
    a.exercise_goal_min,
    a.stand_goal_hr,
    p.step_goal,
    coalesce(w.sessions, 0),
    coalesce(w.session_kcal, 0),
    coalesce(w.session_seconds, 0),
    n.kcal,
    g.kcal
  from calendar c
  cross join prefs p
  left join public.activity_days  a on a.user_id = p_user_id and a.log_date = c.at
  -- Bounded from the arguments so the view sums the range, not the whole diary
  -- (see `trend_days`).
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date = c.at
    and n.log_date between public.local_today(p_user_id)
                           - case p_range when '7d' then 6 when '30d' then 29 else 366 end
                       and public.local_today(p_user_id)
  left join lateral (
    select
      count(*)::integer                as sessions,
      sum(s.active_kcal)::integer      as session_kcal,
      sum(s.duration_s)::integer       as session_seconds
    from public.activity_sessions s
    where s.user_id = p_user_id and s.log_date = c.at
  ) w on true
  left join lateral (
    select gg.kcal
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

CREATE OR REPLACE FUNCTION public.day_marks (
  p_from    date,
  p_to      date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at          date,
    entry_count integer,
    kcal        integer,
    goal_kcal   integer,
    active_kcal integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with calendar as (
    select series::date as at
    from generate_series(p_from, p_to, interval '1 day') as series
  )
  select
    c.at,
    -- Zero, not null. "Was anything logged" is the question the hollow dot
    -- answers, and one spelling of it here beats each caller coalescing.
    coalesce(n.entry_count, 0),
    n.kcal,
    g.kcal,
    a.active_kcal
  from calendar c
  -- The range is repeated beside the join because it is the only half Postgres
  -- can push into the view. `n.log_date = c.at` is a join condition, so without
  -- it every call summed the user's whole diary to keep seven days of it: 49,000
  -- buffers and 15 ms for three years of history, 400 buffers and 1 ms with it.
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date = c.at
    and n.log_date between p_from and p_to
  left join public.activity_days   a on a.user_id = p_user_id and a.log_date = c.at
  left join lateral (
    select gg.kcal
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

CREATE OR REPLACE FUNCTION public.expired_meal_photos (
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    id         uuid,
    photo_path text,
    item_name  text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Entitlement once per subscription rather than once per photograph. A Pro
  -- account's old photographs are kept, so they are read again on every run,
  -- and asking `is_entitled` about each one made the sweep grow with every
  -- paying user's history: 1,381 calls to find 5 photographs on production.
  -- `is_entitled` reads nothing but this table, so an account with no row here
  -- is not entitled, which is what the coalesce below says.
  with subscribers as materialized (
    select s.user_id, s.current_period_end, public.is_entitled(s.user_id) as entitled
    from public.subscriptions s
  )
  select f.id, f.photo_path, f.item_name
   from public.food_logs f
    left join subscribers s on s.user_id = f.user_id
   where f.photo_path is not null
     -- The Worker deletes with bucket credentials. Apply the same key boundary
     -- as the photo signer before untrusted diary text can reach that credential:
     -- owned meals only, bounded, URL-safe and unable to walk out with `..`.
     and f.photo_path like 'meals/' || f.user_id::text || '/%'
     and pg_catalog.char_length(f.photo_path) <= 512
     and f.photo_path ~ '^[A-Za-z0-9/_.-]+$'
     and pg_catalog.strpos(f.photo_path, '..') = 0
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not coalesce(s.entitled, false)
     -- Logged AFTER the paid period ended. See the note above: without this,
     -- a lapsed subscription hands the sweep every photograph the account ever
     -- took, on the night it lapses.
     and f.logged_at > coalesce(s.current_period_end, '-infinity'::timestamptz)
     -- And the grace period: that period must ALSO be more than sixty days
     -- gone. Null coalesces to -infinity, so an account that never subscribed
     -- has nothing to wait for.
     and coalesce(s.current_period_end, '-infinity'::timestamptz)
           < now() - pg_catalog.make_interval(
               days => public.lapsed_photo_grace_days()
             )
   order by f.logged_at
   -- `least`/`greatest` are parser CONSTRUCTS rather than catalog functions, so
   -- they cannot be schema-qualified: `pg_catalog.greatest(...)` is a "function
   -- does not exist" error even though the bare form resolves fine under
   -- `search_path = ''`. They need no qualification for the reason the prefix
   -- exists elsewhere in this file — there is no schema they could be shadowed
   -- from.
   limit least(greatest(p_limit, 1), 1000);
$function$;

GRANT ALL ON FUNCTION public.goals_on(date, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.logging_streak(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_social_photo_etags (
  p_etags jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_posts integer; v_avatars integer;
begin
  if p_etags is null or jsonb_typeof(p_etags) <> 'object' then
    raise exception 'An object of photo key to ETag is required' using errcode = '22023';
  end if;
  with tags as (
    select key, value from jsonb_each_text(p_etags)
     where char_length(value) <= 128 and value ~ '^"[a-zA-Z0-9-]+"$'
  )
  update public.social_posts p set photo_etag = t.value
    from tags t
   where p.photo_path = t.key and p.photo_etag is null
     and p.created_at < now() - interval '10 minutes'
     -- What `social_posts_photo_idx` is limited to, which are also the only
     -- posts `social_photo_claims` hands the signer. Without it each call read
     -- the whole table.
     and p.review_status = 'approved' and not p.quarantined;
  get diagnostics v_posts = row_count;
  with tags as (
    select key, value from jsonb_each_text(p_etags)
     where char_length(value) <= 128 and value ~ '^"[a-zA-Z0-9-]+"$'
  )
  update public.profiles p set photo_etag = t.value
    from tags t
   where p.photo_etag is null
     and p.updated_at < now() - interval '10 minutes'
     -- Spelled as `social_profiles_avatar_idx` is, for the same reason: it is
     -- the only avatar `social_photo_claims` admits, and the index cannot serve
     -- a plain `avatar_path = key`.
     and case when p.avatar_path like 'avatars/' || p.id::text || '/%' then p.avatar_path end = t.key
     and p.review_status = 'approved' and not p.quarantined;
  get diagnostics v_avatars = row_count;
  return v_posts + v_avatars;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_days (
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
  -- The range again beside the join, so the view sums this window and not the
  -- whole diary (see `day_marks`).
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
    and n.log_date between p_from and p_to
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

CREATE OR REPLACE FUNCTION public.trend_days (
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
  -- A bound the planner can push into the view, so it sums the range and not
  -- the whole diary (see `day_marks`). It has to be written from the arguments:
  -- a bound read from `bounds` is a join condition and is not pushed down. A
  -- year reaches back at most 366 days, so the loose figure there costs nothing.
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
    and n.log_date between public.local_today(p_user_id)
                           - case p_range when '7d' then 6 when '30d' then 29 else 366 end
                       and public.local_today(p_user_id)
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
-- Hand-written: `db diff` does not see a revoke. Restated from 90_views.sql and
-- 92_trends.sql, which say why.
REVOKE EXECUTE ON FUNCTION public.goals_on(date, uuid), public.logging_streak(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trend_days(text, uuid), public.trend_series(text, uuid), public.trend_summary(text, uuid) FROM PUBLIC, anon;
