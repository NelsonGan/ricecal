-- ---------------------------------------------------------------------------
-- Per-day facts the user records directly, that are not a food entry.
--
-- Water today; a day note or a mood next. One row per user per day, written only
-- by the user, since there is no background sync anywhere in this app.
--
-- Water is a volume, not a count of glasses. It was `water_glasses`, a smallint
-- of taps, and a glass is not a unit: a mug, a bottle and a restaurant tumbler
-- are all one tap and are 200, 500 and 300 ml. Millilitres are what everything on
-- a bottle is printed in, they add up, and a goal expressed in them can be met by
-- any combination of the things somebody actually drinks.
--
-- Nothing references this table. `food_logs` carries its own `log_date`, so
-- logging a meal never has to create a day first, and a day with no water and no
-- note simply has no row, which is why every read of it coalesces.
-- ---------------------------------------------------------------------------

create table public.daily_logs (
  user_id        uuid not null references auth.users (id) on delete cascade,
  log_date       date not null,

  -- Twenty litres is past any real day and well inside water intoxication
  -- territory; it is a guard against a typo in a custom amount, not a target.
  water_ml       integer not null default 0 check (water_ml between 0 and 20000),
  note           text check (char_length(note) <= 1000),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, log_date)
);

create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

alter table public.daily_logs enable row level security;

grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, update, delete on public.daily_logs to service_role;

create policy "daily_logs: read own"
  on public.daily_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "daily_logs: insert own"
  on public.daily_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "daily_logs: update own"
  on public.daily_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "daily_logs: delete own"
  on public.daily_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- Add (or take back) a volume of water on one day, atomically.
--
-- Why this is not an upsert from the client: glasses were set, so the client
-- always knew the answer it wanted and could write it whole. Millilitres are
-- added, and a read, an addition and a write from the phone is a lost update the
-- moment two taps overlap: 250 and 500 pressed together both read 0 and one of
-- them lands. Quick-add is a row of buttons somebody drums on, so that race is
-- the normal case rather than the unlucky one.
--
-- A negative `p_ml` is how the client takes back what it just added, which is why
-- the total is clamped rather than checked: undoing 500 ml on a day holding 200
-- leaves 0, not a constraint violation on a button the user pressed to fix a
-- mistake. The ceiling is clamped for the same reason, in the other direction.
-- ---------------------------------------------------------------------------
create or replace function public.add_water(
  p_ml    integer,
  p_date  date default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

comment on function public.add_water(integer, date) is
  'Adds p_ml millilitres of water to a day and returns the day''s new total. '
  'Negative amounts take water back. The total is clamped to 0..20000 rather '
  'than checked, so neither an undo nor a fat-fingered custom amount errors.';

revoke all on function public.add_water(integer, date) from public;
grant execute on function public.add_water(integer, date) to authenticated;
