-- ---------------------------------------------------------------------------
-- Preferences: everything that changes what the app shows or does, and nothing
-- that changes what the numbers are.
--
-- Why one wide table and not several: the Me screens read display, notifications
-- and privacy as separate cards, so the obvious move is a table each. But all of
-- it is strictly 1:1 with the user, always read together on that screen, and
-- always written a field at a time. Separate tables would mean a select, an
-- upsert and a set of policies each, all to be kept identical, in exchange for a
-- normalisation that buys nothing.
--
-- Adding a preference is a migration either way. Columns are grouped and
-- commented so the file still reads as sections.
--
-- Meal reminder toggles are not here. They live on `meal_times` next to the time
-- they fire at, because "remind me about lunch" and "lunch is at 13:00" are one
-- fact, and splitting them means a scheduler joins two tables to answer one
-- question.
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,

  -- Display -----------------------------------------------------------------
  units                  public.unit_system not null default 'metric',
  energy                 public.energy_unit not null default 'kcal',
  -- BCP 47. Matches the i18next resource bundle names; 'en' today.
  language               text not null default 'en',

  -- Notifications -----------------------------------------------------------
  notify_water           boolean not null default true,
  notify_weigh_in        boolean not null default true,
  notify_weekly_report   boolean not null default true,
  -- The other look back, on the first of the month. Separate from the weekly
  -- one because they answer different questions and somebody may well want the
  -- month without the week: one is "how did that week go" and the other is a
  -- shape only visible from further away.
  notify_monthly_report  boolean not null default true,
  -- Local wall-clock times, interpreted in profiles.timezone. `time` and not
  -- `timestamptz`: "no notifications after 22:00" is a rule about the user's
  -- clock, and it stays true when they fly somewhere else.
  quiet_from             time not null default '22:00',
  quiet_to               time not null default '07:00',

  -- Activity. The one movement goal nobody's watch supplies. Apple's Move, Exercise
  -- and Stand goals are set on the watch and arrive per day on `activity_days`; a
  -- step goal is not a HealthKit concept at all and Health Connect has no goals of
  -- any kind, so this is the app's own number and the same one on both platforms.
  -- 8,000 rather than the folk 10,000, which comes from a 1960s Japanese
  -- pedometer's brand name.
  step_goal              integer not null default 8000 check (step_goal between 1000 and 50000),
  -- Whether burned calories extend the day's budget. On by default once a
  -- provider is connected, because a user who linked their watch did it for
  -- this. Off is for somebody who wants the movement charts without the budget
  -- moving under them — the number is still shown, it just stops being spent.
  activity_extends_budget boolean not null default true,

  -- Privacy -----------------------------------------------------------------
  share_with_family      boolean not null default false,
  -- Consent to contribute logged dishes to the catalogue in aggregate. Off by
  -- default, and read server-side before any such job runs — a default of true
  -- would make the consent meaningless.
  anonymous_food_data    boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint user_settings_quiet_hours_differ check (quiet_from <> quiet_to)
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update, delete on public.user_settings to service_role;

create policy "user_settings: read own"
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_settings: insert own"
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_settings: update own"
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
