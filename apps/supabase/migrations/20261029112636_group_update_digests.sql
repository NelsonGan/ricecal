-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE INDEX group_messages_automatic_idx ON public.group_messages (created_at)
  WHERE automatic;

CREATE TABLE public.group_update_cursors (
  user_id        uuid                     NOT NULL,
  notified_until timestamp with time zone DEFAULT now() NOT NULL,
  pushed_at      timestamp with time zone
);

ALTER TABLE public.group_update_cursors
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_update_cursors
  ADD CONSTRAINT group_update_cursors_pkey PRIMARY KEY (user_id);

ALTER TABLE public.group_update_cursors
  ADD CONSTRAINT group_update_cursors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_update_cursors TO service_role;

CREATE POLICY "Server only" ON public.group_update_cursors
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);


DROP FUNCTION public.group_update_push_targets(IN p_caller uuid);

CREATE FUNCTION public.group_update_digests()
  RETURNS TABLE (
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
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('group_update_digests'));

  with candidate as (
    select m.user_id, s.group_id, s.author_id, s.body, s.created_at, m.chat_read_at,
      coalesce(s.post_id, s.workout_id, s.activity_id) as thing
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
      and not exists (
        select 1 from public.group_messages r
        join public.group_members rm on rm.group_id = r.group_id and rm.user_id = m.user_id
        where r.automatic and coalesce(r.post_id, r.workout_id, r.activity_id)
            = coalesce(s.post_id, s.workout_id, s.activity_id)
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
$function$;

GRANT ALL ON FUNCTION public.group_update_digests() TO service_role;

CREATE FUNCTION public.record_job_run (
  p_job    text,
  p_ok     boolean,
  p_detail jsonb   DEFAULT NULL::jsonb,
  p_error  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.job_runs (job, finished_at, ok, detail, error)
  values (p_job, pg_catalog.now(), p_ok, p_detail, pg_catalog.left(p_error, 2000));
$function$;

GRANT ALL ON FUNCTION public.record_job_run(text, boolean, jsonb, text) TO service_role;

-- Written by hand. `db diff` misses these.
REVOKE ALL ON public.group_update_cursors FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.group_update_digests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_job_run(text, boolean, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Written by hand. Everyone already in a group starts told up to now, so the
-- job's first run does not push the last hour of shares to every member at once.
INSERT INTO public.group_update_cursors (user_id, notified_until)
SELECT DISTINCT m.user_id, now() FROM public.group_members m
ON CONFLICT (user_id) DO NOTHING;
