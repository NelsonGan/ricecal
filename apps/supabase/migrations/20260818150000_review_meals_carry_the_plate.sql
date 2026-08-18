-- The biggest plates carry the plate.
--
-- `review_meals` returned a name, a drawing and four figures, so the one screen
-- in the app that is about what somebody actually ate drew a camera user's
-- week as five identical outlines. The photograph is already on the row; it was
-- only ever missing from this function's signature.
--
-- Dropped rather than replaced: the returns table is the function's OUT
-- parameters, and Postgres will not change those in place. The grants go with
-- the dropped function, so they are restated below.
--
-- The body is copied out of schemas/95_reviews.sql verbatim, comments included:
-- `db diff` compares prosrc as written, so a retyped comment reads as a
-- function no migration produces.

drop function if exists public.review_meals(text, date, integer, uuid);

create or replace function public.review_meals(
  p_kind    text,
  p_start   date,
  p_limit   integer default 5,
  p_user_id uuid default auth.uid()
)
returns table (
  name          text,
  icon_set      public.icon_set,
  icon_name     text,
  photo_path    text,
  kcal_avg      integer,
  carbs_g_avg   numeric,
  protein_g_avg numeric,
  fat_g_avg     numeric
)
language sql
stable
set search_path = ''
as $$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  entries as (
    -- The view for the arithmetic, the table beside it for the DRAWING.
    -- `food_log_details` nulls both icon columns whenever an entry has a
    -- photograph, because in the diary the photograph is the better picture.
    -- This screen wants BOTH — the plate somebody actually photographed, and a
    -- drawing to fall back on when nobody did — and the view can only ever hand
    -- it one of them.
    select
      e.*,
      coalesce(f.icon_set,  f.item_icon_set)  as own_icon_set,
      coalesce(f.icon_name, f.item_icon_name) as own_icon_name
    from public.food_log_details e
    join public.food_logs f on f.id = e.id
    cross join span s
    where e.user_id = p_user_id and e.log_date between s.from_date and s.to_date
  )
  select
    -- The most recent spelling wins. Two entries differing only in case are one
    -- dish, and the newer one is the one the user last saw on their diary.
    (array_agg(e.food_name order by e.logged_at desc))[1],
    (array_agg(e.own_icon_set  order by e.logged_at desc) filter (where e.own_icon_set  is not null))[1],
    (array_agg(e.own_icon_name order by e.logged_at desc) filter (where e.own_icon_name is not null))[1],
    -- The newest plate anybody photographed under this name, which is not
    -- necessarily the entry the icon came from: a dish logged twice by camera
    -- and once by hand has a photograph and a drawing, and the screen prefers
    -- the photograph exactly as the diary does.
    (array_agg(e.photo_path order by e.logged_at desc) filter (where e.photo_path is not null))[1],
    round(avg(e.kcal))::integer,
    round(avg(e.carbs_g), 1),
    round(avg(e.protein_g), 1),
    round(avg(e.fat_g), 1)
  from entries e
  group by lower(e.food_name)
  -- The dearest plate first. A tie goes to the one eaten more often, which is
  -- the difference between a heavy meal and a heavy habit.
  order by avg(e.kcal) desc, count(*) desc
  limit greatest(p_limit, 0);
$$;

comment on function public.review_meals is
  'The biggest plates of one review period, folded by name and ordered by what '
  'one of them cost. Grouped on the name rather than on food_id, because an '
  'estimate, an archetype and a recipe all log a null id and would otherwise '
  'vanish from the one screen that is about what somebody ate.';

-- A drop takes the grants with it, and a fresh function is executable by
-- PUBLIC until it is told otherwise.
revoke execute on function public.review_meals from public, anon;
grant execute on function public.review_meals to authenticated;
