-- ---------------------------------------------------------------------------
-- When each meal happens for this user, and whether to remind them about it.
--
-- Four columns on `user_settings` would have been fewer moving parts, but the
-- reminder scheduler's query is "give me every user whose lunch reminder is on
-- and whose lunch time is now", and that wants rows rather than columns. It is
-- also the shape that survives a fifth meal without a migration to every query
-- that mentions the four.
-- ---------------------------------------------------------------------------

create table public.meal_times (
  user_id           uuid not null references auth.users (id) on delete cascade,
  meal              public.meal not null,
  -- Local wall-clock, interpreted in profiles.timezone.
  at                time not null,
  reminder_enabled  boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (user_id, meal)
);

create trigger meal_times_set_updated_at
  before update on public.meal_times
  for each row execute function public.set_updated_at();

alter table public.meal_times enable row level security;

grant select, insert, update, delete on public.meal_times to authenticated;
grant select, insert, update, delete on public.meal_times to service_role;

create policy "meal_times: read own"
  on public.meal_times for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "meal_times: insert own"
  on public.meal_times for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "meal_times: update own"
  on public.meal_times for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "meal_times: delete own"
  on public.meal_times for delete
  to authenticated
  using ((select auth.uid()) = user_id);
