-- ---------------------------------------------------------------------------
-- The dots under the week strip on Today.
--
-- One row per calendar day between two dates, carrying only what a dot needs:
-- whether anything was logged, what it came to, and the budget that day was
-- judged against. Three facts and no verdict, because the strip colours the dot
-- from the same three numbers the ring above it already uses.
--
-- Dates rather than a named range, which is the one place this parts company with
-- `trend_days`. A trend range is "the last thirty days" and only `local_today()`
-- knows where that starts; the strip is a calendar week, so there is no window to
-- name and the client already knows the seven days it is drawing.
--
-- The goal is joined per day rather than taken once, for the reason `goals_on()`
-- exists: a budget tightened on Thursday must not repaint Monday's dot.
--
-- `active_kcal` comes along because the budget on Today is `goal + active`.
-- Without it, a day where movement covered the excess draws an over-goal dot
-- under a ring saying there is room left, which is one screen contradicting
-- itself about one day. It is returned beside the goal rather than added into it,
-- since whether it counts at all is `user_settings.activity_extends_budget`.
--
-- Sorts after 93 by name only; it depends on `daily_nutrition` (90) and
-- `activity_days` (41).
-- ---------------------------------------------------------------------------
create or replace function public.day_marks(
  p_from    date,
  p_to      date,
  p_user_id uuid default auth.uid()
)
returns table (
  at          date,
  entry_count integer,
  kcal        integer,
  goal_kcal   integer,
  active_kcal integer
)
language sql
stable
set search_path = ''
as $$
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
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date = c.at
  left join public.activity_days   a on a.user_id = p_user_id and a.log_date = c.at
  left join lateral (
    select gg.kcal
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$$;

comment on function public.day_marks is
  'One row per calendar day between two dates, with that day''s calories, the '
  'goal in force on it and the movement credited to it. Feeds the dots under '
  'the week strip on Today; days with nothing logged are present and empty.';

-- Callable by a signed-in user and nobody else. The revoke is not redundant:
-- Postgres grants EXECUTE to PUBLIC on a newly created function, and a grant to
-- `authenticated` does not take that away.
revoke execute on function public.day_marks from public, anon;
grant  execute on function public.day_marks to authenticated;

-- ---------------------------------------------------------------------------
-- The picture on a day, for the month grid on Today.
--
-- One row per day that had anything logged on it, carrying the one meal worth
-- drawing in a 44pt cell: the day's biggest plate. Biggest rather than newest,
-- because a cell has room for a single dish and "what did I eat that day" is
-- answered by the nasi lemak rather than by the teh tarik that followed it.
--
-- Separate from `day_marks` rather than two more columns on it. The strip on
-- Today asks that function for a week on every swipe and has no use for a
-- picture; joining the diary twice more per day, fifty-two weeks back, would be a
-- cost paid by the screen that does not want it. The calendar wants both and asks
-- for both, once a month.
--
-- Days with nothing logged are absent, unlike `day_marks` where they are present
-- and empty. There the empty row is the answer, since a hollow dot is a verdict
-- about a day somebody missed, and here it would be a row of nulls saying what a
-- missing key already says.
--
-- The photograph and the drawing are returned together and the client prefers the
-- photograph, exactly as `review_meals` does and for the same reason:
-- `food_log_details` nulls an entry's icons whenever it has a photo, and a month
-- whose plates were all photographed would otherwise be a grid of blanks on the
-- day the retention sweep takes the pictures away.
-- ---------------------------------------------------------------------------
create or replace function public.day_plates(
  p_from    date,
  p_to      date,
  p_user_id uuid default auth.uid()
)
returns table (
  at         date,
  food_name  text,
  icon_set   public.icon_set,
  icon_name  text,
  photo_path text
)
language sql
stable
set search_path = ''
as $$
  -- The view for the arithmetic, the table beside it for the DRAWING, exactly
  -- as `review_meals` does it: the view nulls an entry's icons whenever it has
  -- a photograph, and this grid wants whichever of the two survives.
  select distinct on (e.log_date)
    e.log_date,
    e.food_name,
    coalesce(f.icon_set,  f.item_icon_set),
    coalesce(f.icon_name, f.item_icon_name),
    e.photo_path
  from public.food_log_details e
  join public.food_logs f on f.id = e.id
  where e.user_id = p_user_id
    and e.log_date between p_from and p_to
  -- The tie-break is the timestamp rather than nothing at all: two plates of
  -- the same size on one day would otherwise pick whichever the planner
  -- happened to read first, and the cell would change picture between
  -- renders of the same month.
  order by e.log_date, e.kcal desc nulls last, e.logged_at desc;
$$;

comment on function public.day_plates is
  'The biggest plate of each day in a range, with its drawing and its '
  'photograph. Feeds the month grid on Today; days with nothing logged are '
  'absent rather than empty.';

revoke execute on function public.day_plates from public, anon;
grant  execute on function public.day_plates to authenticated;
