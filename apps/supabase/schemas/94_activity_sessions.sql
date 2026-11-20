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
-- The start, kind and source match a rewrite as well as the id: a removed
-- Garmin run comes back under a new id the next time Connect syncs. The source
-- is part of it so that removing Garmin's copy of a run leaves the Apple Watch's
-- recording of the same moment alone.
create table public.activity_session_dismissals (
  user_id      uuid not null references auth.users (id) on delete cascade,
  provider     public.health_provider not null,
  external_id  text not null check (char_length(external_id) between 1 and 200),
  kind         text not null check (char_length(kind) between 1 and 60),
  started_at   timestamptz not null,
  source_name  text check (char_length(source_name) <= 120),
  created_at   timestamptz not null default now(),
  primary key (user_id, provider, external_id)
);

create index activity_session_dismissals_start_idx
  on public.activity_session_dismissals (user_id, provider, started_at);

alter table public.activity_session_dismissals enable row level security;

create policy "Server only" on public.activity_session_dismissals as restrictive
  for all to anon, authenticated using (false) with check (false);

-- Written only by `delete_activity_session`, read only by the trigger and the
-- reconcile. The app has no reason to see the list.
revoke all on public.activity_session_dismissals from public, anon, authenticated;
grant select, insert, update, delete on public.activity_session_dismissals to service_role;


-- Whether a workout the store reported is one the person removed.
create or replace function private.activity_dismissed(
  p_user uuid, p_provider public.health_provider, p_external_id text,
  p_started_at timestamptz, p_kind text, p_source text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activity_session_dismissals d
    where d.user_id = p_user and d.provider = p_provider
      and (d.external_id = p_external_id
        or (d.started_at = p_started_at and d.kind = p_kind
            and d.source_name is not distinct from p_source))
  );
$$;

revoke execute on function private.activity_dismissed(uuid, public.health_provider, text, timestamptz, text, text)
  from public, anon, authenticated;


-- A removed workout's insert is skipped rather than refused. A refusal would
-- fail the whole batch of a sync, old binaries' included, for as long as the
-- workout stays in the read window.
--
-- A row already stored under the same id goes ahead: a BEFORE INSERT trigger
-- also fires for an upsert that will become an update, and skipping it would
-- freeze a copy the person kept (another copy of a run they removed one of).
--
-- Another copy of a workout already stored (same start, kind and source under
-- a new id) is skipped too. Old binaries have no reconcile, so without this
-- every Garmin rewrite they synced was a new row and a new group card; and a
-- store briefly holding both the old and the new copy would add one even on a
-- new binary. A new binary's reconcile re-keys the stored row before its
-- upsert, so that upsert lands on it as an update.
create or replace function private.skip_dismissed_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.activity_sessions a
    where a.user_id = new.user_id and a.provider = new.provider and a.external_id = new.external_id
  ) then
    return new;
  end if;
  if exists (
    select 1 from public.activity_sessions a
    where a.user_id = new.user_id and a.provider = new.provider
      and a.started_at = new.started_at and a.kind = new.kind
      and a.source_name is not distinct from new.source_name
  ) then
    return null;
  end if;
  if private.activity_dismissed(new.user_id, new.provider, new.external_id,
                                new.started_at, new.kind, new.source_name) then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function private.skip_dismissed_activity() from public, anon, authenticated;

-- Never shared: `group_share_activity` is an AFTER trigger, and a skipped row
-- is never inserted.
create trigger activity_sessions_skip_dismissed
  before insert on public.activity_sessions
  for each row execute function private.skip_dismissed_activity();


-- Called by a sync pass before it upserts what it read, with the identity of
-- every workout the store returned for the window.
--
-- It only ever acts on stored rows that are another copy of a workout the
-- store returned: same start, same kind, an id the store did not return.
--
--   * When the returned workout is not stored yet, the oldest such copy takes
--     its id, so the upsert that follows updates it: the row keeps its id, its
--     group card and its reactions, and nothing is shared again. For a workout
--     the person removed, only a copy from the same source, which is the copy
--     they kept when they removed a duplicate; with none left the run stays
--     removed.
--   * Any copy left over is deleted. Garmin Connect deletes and re-saves its
--     workouts in Apple Health under a new id, and an upsert alone kept every
--     copy: one run showed four times on Today.
--
-- A row the read did not mention at all is left alone. Absence proves nothing:
-- a second phone on the same provider has its own store, a new phone's Health
-- may still be downloading, Health Connect hides what is older than 30 days
-- before the grant, and Garmin's delete can land a pass before its re-save.
-- Deleting the person's workouts on any of those is far worse than a workout
-- deleted in Health lingering here, where it can now be deleted by hand.
create or replace function public.reconcile_activity_sessions(
  p_provider public.health_provider,
  p_from     timestamptz,
  p_to       timestamptz,
  p_sessions jsonb,
  p_user_id  uuid default auth.uid()
)
returns integer
language plpgsql
-- Definer, to consult the removed list the app cannot read. Every statement
-- below is scoped to `auth.uid()`, never to an argument.
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seen text[];
  v_new record;
  v_rekeyed integer := 0;
  v_deleted integer;
  v_dismissed boolean;
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
    select distinct s.external_id, s.started_at, s.kind, s.source_name
    from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text, source_name text)
    where not exists (
      select 1 from public.activity_sessions a
      where a.user_id = v_user and a.provider = p_provider and a.external_id = s.external_id
    )
  loop
    v_dismissed := private.activity_dismissed(v_user, p_provider, v_new.external_id,
                                              v_new.started_at, v_new.kind, v_new.source_name);
    update public.activity_sessions a
       set external_id = v_new.external_id
     where a.id = (
       select o.id from public.activity_sessions o
       where o.user_id = v_user and o.provider = p_provider
         and o.started_at = v_new.started_at and o.kind = v_new.kind
         -- Overlapping the window, as the store's read does: a run across the
         -- window's first midnight is returned, and its copies must match.
         and o.started_at < p_to and o.ended_at > p_from
         and o.external_id <> all (v_seen)
         and (not v_dismissed or o.source_name is not distinct from v_new.source_name)
       order by o.created_at
       limit 1
     );
    v_rekeyed := v_rekeyed + (case when found then 1 else 0 end);
  end loop;

  delete from public.activity_sessions a
  where a.user_id = v_user and a.provider = p_provider
    and a.started_at < p_to and a.ended_at > p_from
    and a.external_id <> all (v_seen)
    and exists (
      select 1 from jsonb_to_recordset(p_sessions) as s(started_at timestamptz, kind text)
      where s.started_at = a.started_at and s.kind = a.kind
    );
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

  insert into public.activity_session_dismissals (user_id, provider, external_id, kind, started_at, source_name)
  values (v_user, v_row.provider, v_row.external_id, v_row.kind, v_row.started_at, v_row.source_name)
  on conflict (user_id, provider, external_id) do nothing;

  return true;
end;
$$;

comment on function public.delete_activity_session(uuid) is
  'Deletes one of the caller''s synced workouts and records it, so a later '
  'sync of the same workout, or of a copy re-saved under a new id, skips it.';

revoke execute on function public.delete_activity_session(uuid) from public, anon;
grant execute on function public.delete_activity_session(uuid) to authenticated, service_role;
