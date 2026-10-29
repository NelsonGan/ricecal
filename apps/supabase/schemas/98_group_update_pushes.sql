-- ---------------------------------------------------------------------------
-- Pushes for the foods and workouts members share to their group chats on
-- their own (98_group_chat_shares.sql), sent by the jobs Worker's
-- `group-updates` job once a minute.
--
-- The server sends them rather than the poster's app, because a trigger writes
-- the share, so the app cannot name it, and an app that is closed, offline or
-- from before this would never ask. The job also sees everything waiting for a
-- person at once, which is what lets it keep the volume down: these are on by
-- default for every meal of every member, and a phone that buzzes thirty times
-- a day gets RiceCal's notifications turned off, nudges and chat included.
--
-- So each person gets at most one update push every fifteen minutes, naming the
-- newest thing and how many more there are, and none between 22:00 and 07:00
-- in their own time zone. A share waits at most an hour; past that the chat
-- already holds it and a push would be old news.
-- ---------------------------------------------------------------------------

-- How far each person has been told. Shares written before `notified_until`
-- have been pushed or passed over (muted, read, too old); `pushed_at` is when
-- the last update push went, for the spacing. A person with no row has never
-- been pushed one, and their membership's `joined_at` bounds what they hear.
create table public.group_update_cursors (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  notified_until timestamptz not null default now(),
  pushed_at      timestamptz
);

alter table public.group_update_cursors enable row level security;
revoke all on public.group_update_cursors from anon, authenticated;
grant all on public.group_update_cursors to service_role;
create policy "Server only" on public.group_update_cursors as restrictive for all to anon, authenticated
  using (false) with check (false);

-- The job reads the last hour of shares every minute; this keeps that a short
-- range scan rather than a pass over every message.
create index group_messages_automatic_idx on public.group_messages(created_at) where automatic;

-- One row per device of everyone due an update push now, and those people's
-- cursors moved past what was considered, in one statement: a run delivered
-- twice finds nothing the second time. The advisory lock makes an overlapping
-- run wait and then see the moved cursors, since the query's snapshot is taken
-- after the lock is held.
--
-- Who hears a share: the other members of its group who keep `notify_updates`
-- on, who joined before it, who are not blocked either way with its author,
-- and who have not read it in any group's chat (an open chat marks it read as
-- it lands, which is why a share is left ten seconds first). A meal shared into
-- two groups counts once, through the group whose chat they read last, which is
-- also the chat the push opens.
create or replace function public.group_update_digests()
returns table (token text, language text, group_id uuid, group_name text, actor_name text,
  body text, more integer)
language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('group_update_digests'));

  with candidate as (
    select m.user_id, s.group_id, s.author_id, s.body, s.created_at, m.chat_read_at,
      coalesce(s.post_id, s.workout_id, s.activity_id, s.id) as thing
    from public.group_messages s
    join public.group_members m on m.group_id = s.group_id and m.user_id <> s.author_id
      and m.notify_updates
    left join public.group_update_cursors c on c.user_id = m.user_id
    where s.automatic and not s.quarantined
      and s.created_at > now() - interval '1 hour'
      and s.created_at <= now() - interval '10 seconds'
      and s.created_at > greatest(c.notified_until, m.joined_at)
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = s.author_id and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = s.author_id)
      )
      -- Its copies in other groups were written in the same statement, so the
      -- window bounds the search to the index rather than all history.
      and not exists (
        select 1 from public.group_messages r
        join public.group_members rm on rm.group_id = r.group_id and rm.user_id = m.user_id
        where r.automatic and r.created_at > now() - interval '2 hours'
          and coalesce(r.post_id, r.workout_id, r.activity_id, r.id)
            = coalesce(s.post_id, s.workout_id, s.activity_id, s.id)
          and rm.chat_read_at >= r.created_at
      )
  ),
  once as (
    select distinct on (k.user_id, k.thing) k.*
    from candidate k
    order by k.user_id, k.thing, k.chat_read_at desc, k.group_id
  ),
  ranked as (
    select o.*, count(*) over (partition by o.user_id) as total,
      row_number() over (partition by o.user_id order by o.created_at desc, o.group_id) as newest
    from once o
  ),
  due as (
    select r.user_id, r.group_id, r.author_id, r.body, (r.total - 1)::integer as more
    from ranked r
    join public.profiles p on p.id = r.user_id
    left join public.group_update_cursors c on c.user_id = r.user_id
    where r.newest = 1
      and (c.pushed_at is null or c.pushed_at <= now() - interval '15 minutes')
      and extract(hour from now() at time zone p.timezone) between 7 and 21
  ),
  marked as (
    insert into public.group_update_cursors as c (user_id, notified_until, pushed_at)
    select d.user_id, now() - interval '10 seconds', now() from due d
    on conflict (user_id) do update
      set notified_until = excluded.notified_until, pushed_at = excluded.pushed_at
    returning c.user_id
  )
  select t.token, coalesce(st.language, 'en'), d.group_id, g.name,
    coalesce(nullif(btrim(a.display_name), ''), a.handle), d.body, d.more
  from due d
  join marked k on k.user_id = d.user_id
  join public.push_tokens t on t.user_id = d.user_id
  join public.groups g on g.id = d.group_id
  join public.profiles a on a.id = d.author_id
  left join public.user_settings st on st.user_id = d.user_id;
$$;

revoke execute on function public.group_update_digests from public, anon, authenticated;
grant execute on function public.group_update_digests to service_role;
