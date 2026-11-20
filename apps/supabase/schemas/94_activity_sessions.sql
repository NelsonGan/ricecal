-- ---------------------------------------------------------------------------
-- Keeping a health store's workouts in step with the store, and letting the
-- person remove one.
--
-- `activity_sessions` is keyed by the store's own id so that re-reading a week
-- converges. That held until an app that re-saves its workouts: Garmin Connect
-- deletes and re-writes each one in Apple Health on later syncs, under a new
-- `HKWorkout.uuid`, so every rewrite was a new row and a run showed four times
-- on Today, each copy also shared to the person's groups. An upsert alone can
-- only ever add.
--
-- Old binaries never call these and keep their plain upserts. The trigger below
-- still applies to them, so a workout removed on a new app stays removed even
-- while an old app on another device syncs.
-- ---------------------------------------------------------------------------


-- What the person removed, so the next sync does not bring it back. The store
-- still holds it, and the sync re-reads a week on every foreground.
--
-- `started_at` and `kind` match a rewrite as well as the id: a removed Garmin
-- run comes back under a new id the next time Connect syncs.
create table public.activity_session_dismissals (
  user_id      uuid not null references auth.users (id) on delete cascade,
  provider     public.health_provider not null,
  external_id  text not null check (char_length(external_id) between 1 and 200),
  kind         text not null check (char_length(kind) between 1 and 60),
  started_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, provider, external_id)
);

create index activity_session_dismissals_start_idx
  on public.activity_session_dismissals (user_id, provider, started_at);

alter table public.activity_session_dismissals enable row level security;

create policy "Server only" on public.activity_session_dismissals as restrictive
  for all to anon, authenticated using (false) with check (false);

-- Written only by `delete_activity_session`, read only by the trigger. The app
-- has no reason to see the list.
revoke all on public.activity_session_dismissals from public, anon, authenticated;
grant select, insert, update, delete on public.activity_session_dismissals to service_role;


-- A removed workout's insert is skipped rather than refused. A refusal would
-- fail the whole batch of a sync, old binaries' included, for as long as the
-- workout stays in the read window.
create or replace function private.skip_dismissed_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.activity_session_dismissals d
    where d.user_id = new.user_id and d.provider = new.provider
      and (d.external_id = new.external_id
        or (d.started_at = new.started_at and d.kind = new.kind))
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function private.skip_dismissed_activity() from public, anon, authenticated;

-- Named to sort before `group_share_activity`, an AFTER trigger in any case:
-- a skipped row is never shared.
create trigger activity_sessions_skip_dismissed
  before insert on public.activity_sessions
  for each row execute function private.skip_dismissed_activity();


-- Called by a sync pass before it upserts what it read, with the identity of
-- every workout the store returned for the window.
--
--   * A row whose id the store no longer has, but which starts at the same
--     moment as a new id of the same kind, is the same workout re-saved. It
--     takes the new id, so the upsert that follows updates it: the row keeps
--     its id, its group card and its reactions, and nothing is shared again.
--   * Any other row in the window whose id the store no longer has was deleted
--     there, and is deleted here.
--
-- Only rows lying wholly inside the window are touched. Both stores return a
-- workout that overlaps the window, so every such row was in the read.
--
-- An empty list removes nothing. An unavailable store or a refused permission
-- reads as no workouts, and that is not a week with none in it.
create or replace function public.reconcile_activity_sessions(
  p_provider public.health_provider,
  p_from     timestamptz,
  p_to       timestamptz,
  p_sessions jsonb,
  p_user_id  uuid default auth.uid()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seen text[];
  v_new record;
  v_rekeyed integer := 0;
  v_deleted integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- A sync can outlive sign-out, as with `replace_activity_hours`.
  if p_user_id is distinct from v_user then
    raise exception 'Health account changed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '32 days' then
    raise exception 'Invalid workout window' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Expected workouts' using errcode = '22023';
  end if;
  if jsonb_array_length(p_sessions) = 0 then
    return 0;
  end if;
  if jsonb_array_length(p_sessions) > 2000 then
    raise exception 'Too many workouts' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text)
    where s.external_id is null or s.external_id = '' or s.started_at is null or s.kind is null
  ) then
    raise exception 'Expected an id, a start and a kind' using errcode = '22023';
  end if;

  select array_agg(distinct s.external_id) into v_seen
  from jsonb_to_recordset(p_sessions) as s(external_id text);

  for v_new in
    select distinct s.external_id, s.started_at, s.kind
    from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text)
    where not exists (
      select 1 from public.activity_sessions a
      where a.user_id = v_user and a.provider = p_provider and a.external_id = s.external_id
    )
  loop
    update public.activity_sessions a
       set external_id = v_new.external_id
     where a.id = (
       select o.id from public.activity_sessions o
       where o.user_id = v_user and o.provider = p_provider
         and o.started_at = v_new.started_at and o.kind = v_new.kind
         and o.started_at >= p_from and o.ended_at <= p_to
         and o.external_id <> all (v_seen)
       order by o.created_at
       limit 1
     );
    v_rekeyed := v_rekeyed + (case when found then 1 else 0 end);
  end loop;

  delete from public.activity_sessions a
  where a.user_id = v_user and a.provider = p_provider
    and a.started_at >= p_from and a.ended_at <= p_to
    and a.external_id <> all (v_seen);
  get diagnostics v_deleted = row_count;

  return v_rekeyed + v_deleted;
end;
$$;

revoke execute on function public.reconcile_activity_sessions from public, anon;
grant execute on function public.reconcile_activity_sessions to authenticated, service_role;


-- Remove one synced workout, and remember it so the sync leaves it out.
-- Answers false when there was nothing of this account's to remove.
create or replace function public.delete_activity_session(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.activity_sessions;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.activity_sessions a
  where a.id = p_id and a.user_id = v_user
  returning * into v_row;
  if not found then
    return false;
  end if;

  insert into public.activity_session_dismissals (user_id, provider, external_id, kind, started_at)
  values (v_user, v_row.provider, v_row.external_id, v_row.kind, v_row.started_at)
  on conflict (user_id, provider, external_id) do nothing;

  return true;
end;
$$;

comment on function public.delete_activity_session(uuid) is
  'Deletes one of the caller''s synced workouts and records it, so a later '
  'sync of the same workout, or of a copy re-saved under a new id, skips it.';

revoke execute on function public.delete_activity_session(uuid) from public, anon;
grant execute on function public.delete_activity_session(uuid) to authenticated, service_role;
