-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.group_members
  ADD COLUMN updates_told_until timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE public.group_members
  ADD COLUMN updates_pushed_at timestamp with time zone;

CREATE INDEX group_messages_automatic_idx ON public.group_messages USING brin (created_at)
  WHERE automatic;


DROP FUNCTION public.group_update_push_targets(IN p_caller uuid);

CREATE FUNCTION public.group_update_digests (
  p_limit integer DEFAULT 90
)
  RETURNS TABLE (
    user_id    uuid,
    token      text,
    language   text,
    group_id   uuid,
    group_name text,
    actor_name text,
    body       text,
    more       integer
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.group_update_digests(integer) TO service_role;

CREATE FUNCTION public.record_job_run (
  p_job    text,
  p_ok     boolean,
  p_detail jsonb   DEFAULT NULL::jsonb,
  p_error  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_hour timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
begin
  update public.job_runs r
     set finished_at = pg_catalog.now(),
         error       = coalesce(pg_catalog.left(p_error, 2000), r.error),
         detail      = (
           select pg_catalog.jsonb_object_agg(k.key,
             coalesce((r.detail ->> k.key)::numeric, 0) + coalesce((p_detail ->> k.key)::numeric, 0))
           from (
             select pg_catalog.jsonb_object_keys(coalesce(r.detail, '{}'::jsonb)) as key
             union
             select pg_catalog.jsonb_object_keys(coalesce(p_detail, '{}'::jsonb))
           ) k
         )
   where r.job = p_job and r.ok = p_ok and r.started_at = v_hour;
  if found then return; end if;
  insert into public.job_runs (job, started_at, finished_at, ok, detail, error)
  values (p_job, v_hour, pg_catalog.now(), p_ok, p_detail, pg_catalog.left(p_error, 2000));
end;
$function$;

GRANT ALL ON FUNCTION public.record_job_run(text, boolean, jsonb, text) TO service_role;

-- Written by hand. `db diff` misses these.
REVOKE EXECUTE ON FUNCTION public.group_update_digests(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_job_run(text, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;
