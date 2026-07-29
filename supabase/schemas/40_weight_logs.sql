-- ---------------------------------------------------------------------------
-- Body weight over time. The source of truth for "what does this user weigh",
-- which is why `profiles` has no weight column.
--
-- One row per user per day: a smart scale that syncs three readings before
-- breakfast should not draw three points on the chart, and the last one of the
-- day is the one a user would recognise as today's weight. A second reading
-- upserts over the first.
-- ---------------------------------------------------------------------------

create table public.weight_logs (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- The user's local calendar day, not the instant.
  measured_on   date not null,

  weight_kg     numeric(5, 2) not null check (weight_kg between 20 and 400),
  -- Scales that report it. Null is unknown, never zero.
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 1 and 75),

  source        public.measurement_source not null default 'manual',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (user_id, measured_on)
);

-- The chart reads a trailing range; the target recompute reads the newest row.
-- Descending so both are a forward scan of the index.
create index weight_logs_user_measured_idx
  on public.weight_logs (user_id, measured_on desc);

create trigger weight_logs_set_updated_at
  before update on public.weight_logs
  for each row execute function public.set_updated_at();

alter table public.weight_logs enable row level security;

grant select, insert, update, delete on public.weight_logs to authenticated;
grant select, insert, update, delete on public.weight_logs to service_role;

create policy "weight_logs: read own"
  on public.weight_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "weight_logs: insert own"
  on public.weight_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "weight_logs: update own"
  on public.weight_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "weight_logs: delete own"
  on public.weight_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);
