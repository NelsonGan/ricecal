-- ---------------------------------------------------------------------------
-- The picture on a day, for the month grid on Today.
--
-- One row per day that had anything logged on it, carrying the ONE meal worth
-- drawing in a 44pt cell: the day's biggest plate. Biggest rather than newest,
-- because a cell has room for a single dish and "what did I eat that day" is
-- answered by the nasi lemak rather than by the teh tarik that followed it.
--
-- Separate from `day_marks` rather than two more columns on it. The strip on
-- Today asks that function for a WEEK on every swipe and has no use for a
-- picture; joining the diary twice more per day, fifty-two weeks back, would be
-- a cost paid by the screen that does not want it. The calendar wants both and
-- asks for both, once a month.
--
-- Days with nothing logged are ABSENT, unlike `day_marks` where they are
-- present and empty. There the empty row is the answer — a hollow dot is a
-- verdict about a day somebody missed — and here it would be a row of nulls
-- saying what a missing key already says.
--
-- The photograph and the drawing are returned TOGETHER and the client prefers
-- the photograph, exactly as `review_meals` does and for the same reason:
-- `food_log_details` nulls an entry's icons whenever it has a photo, and a
-- month whose plates were all photographed would otherwise be a grid of blanks
-- on the day the retention sweep takes the pictures away.
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
