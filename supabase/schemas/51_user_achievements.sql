-- ---------------------------------------------------------------------------
-- Which badges a user has earned, and when.
--
-- Absence is the unearned state. There is no `earned boolean`, because a row
-- per user per badge with a false flag means seeding nine rows for every
-- signup, then keeping that seed in step with the catalogue forever. The
-- achievements panel left-joins the catalogue instead and renders a null
-- `earned_at` as locked.
-- ---------------------------------------------------------------------------

create table public.user_achievements (
  user_id          uuid not null references auth.users (id) on delete cascade,
  achievement_key  text not null references public.achievements (key) on delete cascade,

  earned_at        timestamptz not null default now(),
  -- What earned it, for badges that count something: "14 days", "8 glasses".
  -- Rendered beside the badge, null when the badge needs no qualifier.
  detail           text check (char_length(detail) <= 80),

  primary key (user_id, achievement_key)
);

alter table public.user_achievements enable row level security;

-- Read-only to clients. A badge the user can grant themselves is not an
-- achievement; the awarding job runs as service_role.
grant select on public.user_achievements to authenticated;
grant select, insert, update, delete on public.user_achievements to service_role;

create policy "user_achievements: read own"
  on public.user_achievements for select
  to authenticated
  using ((select auth.uid()) = user_id);
