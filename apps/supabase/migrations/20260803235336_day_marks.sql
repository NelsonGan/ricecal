-- The week strip's dots on Today. Mirrors schemas/94_day_marks.sql.
-- Applied to the remote project directly; Docker is not running here, so the
-- declarative diff could not generate it.

-- ---------------------------------------------------------------------------
-- The dots under the week strip on Today.
--
-- One row per calendar day between two dates, carrying only what a dot needs:
-- whether anything was logged, what it came to, and the budget that day was
-- judged against. Three facts and no verdict — the strip colours the dot, and
-- it does so from the same three numbers the ring above it already uses.
--
-- Dates rather than a named range, which is the one place this parts company
-- with `trend_days`. A trend range is "the last thirty days" and only
-- `local_today()` knows where that starts; the strip is a CALENDAR week —
-- Monday to Sunday, and whichever earlier week has been swiped back to — so
-- there is no window to name and the client already knows the seven days it is
-- drawing.
--
-- The goal is joined per day rather than taken once, for the reason `goals_on()`
-- exists: a budget tightened on Thursday must not repaint Monday's dot.
--
-- `active_kcal` comes along because the budget on Today is `goal + active`.
-- Without it, a day where movement covered the excess draws an over-goal dot
-- under a ring saying there is room left — one screen contradicting itself
-- about one day. It is returned BESIDE the goal rather than added into it,
-- since whether it counts at all is `user_settings.activity_extends_budget`,
-- and Today already applies that rule to the ring.
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
