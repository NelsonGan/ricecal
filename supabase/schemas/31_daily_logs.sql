-- ---------------------------------------------------------------------------
-- Per-day facts the user records directly, that are not a food entry.
--
-- Water today; a day note or a mood next. Kept separate from `daily_activity`,
-- which holds the same grain but arrives from a watch: two writers on one row
-- means a background sync and a tap on the water tracker race for the same
-- upsert, and the loser's write disappears. Different sources, different rows.
--
-- Nothing references this table. `food_logs` carries its own `log_date`, so
-- logging a meal never has to create a day first, and a day with no water and
-- no note simply has no row — which is why every read of it coalesces.
-- ---------------------------------------------------------------------------

create table public.daily_logs (
  user_id        uuid not null references auth.users (id) on delete cascade,
  log_date       date not null,

  water_glasses  smallint not null default 0 check (water_glasses between 0 and 60),
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
