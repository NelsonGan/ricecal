-- ---------------------------------------------------------------------------
-- Preferences: everything that changes what the app shows or does, and
-- nothing that changes what the numbers are.
--
-- WHY ONE WIDE TABLE AND NOT THREE
--
-- The Me screens read notifications, integrations and privacy as three cards,
-- so the obvious move is three tables. But all three are strictly 1:1 with the
-- user, always read together on that screen, and always written a field at a
-- time. Three tables would mean three selects, three upserts and three sets of
-- policies to keep identical, in exchange for a normalisation that buys
-- nothing — there is no cardinality to model.
--
-- Adding a preference is a migration either way. Columns are grouped and
-- commented so the file still reads as three sections.
--
-- Meal reminder toggles are NOT here. They live on `meal_times` next to the
-- time they fire at, because "remind me about lunch" and "lunch is at 13:00"
-- are one fact, and splitting them means a scheduler joins two tables to
-- answer one question.
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
  -- Local wall-clock times, interpreted in profiles.timezone. `time` and not
  -- `timestamptz`: "no notifications after 22:00" is a rule about the user's
  -- clock, and it stays true when they fly somewhere else.
  quiet_from             time not null default '22:00',
  quiet_to               time not null default '07:00',

  -- Integrations ------------------------------------------------------------
  -- Which sources the user has agreed to pull from. The permission itself
  -- lives on the device; this is intent, and it is what the client checks
  -- before asking the OS again.
  connect_watch          boolean not null default false,
  connect_phone_health   boolean not null default false,
  connect_running_app    boolean not null default false,
  connect_smart_scale    boolean not null default false,
  auto_sync              boolean not null default true,
  wifi_only              boolean not null default false,

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
