-- ---------------------------------------------------------------------------
-- The badge catalogue. Global, read-only to clients, seeded by migration.
--
-- `key` is the i18n key the client already uses (`AchievementKey` in
-- src/mock/types.ts), not a uuid, so a row and its copy are named the same
-- thing and a badge with no label is impossible to miss: the screen renders
-- the key.
--
-- The rule that earns a badge is not here. Encoding "log seven days in a row"
-- as data means an expression language and an evaluator; it stays in one
-- server-side job that reads this table for presentation only.
-- ---------------------------------------------------------------------------

create table public.achievements (
  key         text primary key check (key ~ '^[a-zA-Z][a-zA-Z0-9]*$'),

  icon_set    public.icon_set not null default 'system',
  icon_name   text not null,
  tone        public.badge_tone not null default 'pandan',
  -- Display order on the achievements panel. Ascending.
  position    smallint not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger achievements_set_updated_at
  before update on public.achievements
  for each row execute function public.set_updated_at();

alter table public.achievements enable row level security;

-- Read-only to clients: no insert/update/delete grant at all, so the catalogue
-- cannot be edited from a phone even if a policy is added by mistake later.
grant select on public.achievements to authenticated;
grant select, insert, update, delete on public.achievements to service_role;

create policy "achievements: readable by signed-in users"
  on public.achievements for select
  to authenticated
  using (true);
