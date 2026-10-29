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
-- So each person gets at most one update push every ten minutes, from one
-- group, naming its newest share and counting the rest of that group's; none
-- between 22:00 and 07:00 in their own time zone (the same window as the
-- unused `user_settings.quiet_from/quiet_to` defaults, which the app no longer
-- honours anywhere); and nothing over an hour old, since by then the chat
-- already holds it and a push would be old news. Another group's shares wait
-- for the next allowed push. What each member has been told is kept on their
-- membership (`group_members.updates_told_until`, `updates_pushed_at`).
-- ---------------------------------------------------------------------------

-- The job reads the last hour of shares every minute. BRIN because the column
-- follows insert order and only recent ranges are read: a B-tree would keep an
-- entry for every share ever made.
create index group_messages_automatic_idx on public.group_messages using brin (created_at)
  where automatic;

-- Up to `p_limit` people due an update push now, one row per device, with the
-- membership they were told through moved forward in the same statement: a
-- run delivered twice finds nothing the second time. Called repeatedly until a
-- call returns fewer people than `p_limit`, because PostgREST caps an answer at
-- 1,000 rows and a person has at most ten devices.
--
-- Who hears a share: the other members of its group who keep `notify_updates`
-- on, are not blocked either way with its author, have a device, and have not
-- read it in any group's chat. A share is left half a minute first: an open
-- chat marks it read as it lands, and the margin also outlasts the writing
-- transaction (the share's `created_at` is when that began; it is visible only
-- once it commits). A meal shared into two groups counts once, through the
-- group whose chat they read last, which is the chat the push opens.
create or replace function public.group_update_digests(p_limit integer default 90)
returns table (user_id uuid, token text, language text, group_id uuid, group_name text,
  actor_name text, body text, more integer)
language sql security definer set search_path = '' as $$
  -- One run at a time, and a run that finds another going returns nothing
  -- rather than queueing behind it on a pooled connection. Taken in its own
  -- statement so the query below snapshots after the lock is held, and sees
  -- whatever the previous holder committed.
  select pg_catalog.set_config('ricecal.group_update_digests',
    pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('group_update_digests'))::text, true);

  with copy as (
    select m.user_id, s.group_id, s.author_id, s.body, s.created_at, m.chat_read_at,
      m.updates_told_until, coalesce(s.post_id, s.workout_id, s.activity_id, s.id) as thing
    from public.group_messages s
    join public.group_members m on m.group_id = s.group_id and m.user_id <> s.author_id
      and m.notify_updates and m.chat_read_at < s.created_at
    join public.profiles p on p.id = m.user_id
    where pg_catalog.current_setting('ricecal.group_update_digests') = 'true'
      and s.automatic and not s.quarantined
      and s.created_at > now() - interval '1 hour'
      and s.created_at <= now() - interval '30 seconds'
      -- The person-level checks first, so whoever cannot be pushed this minute
      -- (asleep, spaced, no device) costs nothing further.
      and extract(hour from now() at time zone p.timezone) between 7 and 21
      and not exists (
        select 1 from public.group_members q
        where q.user_id = m.user_id and q.updates_pushed_at > now() - interval '10 minutes'
      )
      and exists (select 1 from public.push_tokens t where t.user_id = m.user_id)
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = s.author_id and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = s.author_id)
      )
  ),
  -- Read in any group, muted ones included, is seen. A share's copies are
  -- written in one statement, so they share `created_at`.
  unread as (
    select c.* from copy c
    where not exists (
      select 1 from public.group_messages r, public.group_members rm
      where r.automatic and r.created_at = c.created_at
        and coalesce(r.post_id, r.workout_id, r.activity_id, r.id) = c.thing
        and rm.group_id = r.group_id and rm.user_id = c.user_id
        and rm.chat_read_at >= r.created_at
    )
  ),
  -- Each thing through one group. A pending share's choice cannot change, as
  -- reading any of its chats since would have made it read.
  chosen as (
    select distinct on (u.user_id, u.thing) u.*
    from unread u
    order by u.user_id, u.thing, u.chat_read_at desc, u.group_id
  ),
  pending as (
    select k.* from chosen k where k.created_at > k.updates_told_until
  ),
  -- The group of the newest pending share, and how many more it has.
  due as (
    select n.user_id, n.group_id, n.author_id, n.body, n.created_at,
      (select count(*) from pending q where q.user_id = n.user_id and q.group_id = n.group_id)::integer - 1
        as more
    from (
      select distinct on (p.user_id) p.*
      from pending p
      order by p.user_id, p.created_at desc, p.group_id
    ) n
    order by n.user_id
    limit p_limit
  ),
  -- Told up to the newest share pushed, not to the clock, so a share that
  -- commits late with a later `created_at` is still ahead of the mark.
  told as (
    update public.group_members m
    set updates_told_until = d.created_at, updates_pushed_at = now()
    from due d
    where m.user_id = d.user_id and m.group_id = d.group_id
  )
  select d.user_id, t.token, coalesce(st.language, 'en'), d.group_id, g.name,
    coalesce(nullif(btrim(a.display_name), ''), a.handle), d.body, d.more
  from due d
  join public.push_tokens t on t.user_id = d.user_id
  join public.groups g on g.id = d.group_id
  join public.profiles a on a.id = d.author_id
  left join public.user_settings st on st.user_id = d.user_id
  order by d.user_id;
$$;

revoke execute on function public.group_update_digests from public, anon, authenticated;
grant execute on function public.group_update_digests to service_role;
