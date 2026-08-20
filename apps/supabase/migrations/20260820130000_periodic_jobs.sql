-- Periodic jobs move to Cloudflare: the run ledger they record themselves in.
--
-- `job_runs`, `claim_job_run` and `finish_job_run` are the Postgres half of the
-- scheduler in `apps/cloudflare/workers/jobs`. The jobs themselves are Workers
-- on Cron Triggers, so nothing about the schedule lives here any more; what
-- lives here is the record and the guard against two runs overlapping.
--
-- `expired_meal_photos` is dropped and recreated only because its RETURN TYPE
-- changed: it hands back `item_name` now, so the sweep can pick each row's
-- replacement drawing without a second query against `food_logs`. Additive from
-- every caller's point of view, so the edge function still reading it during the
-- cutover is unaffected.
--
-- HAND-EDITED, AND THE EDIT IS THE REVOKES. `supabase db diff` does not track
-- function grants — it emits the `GRANT ... TO service_role` and says nothing
-- about the EXECUTE that Postgres gives PUBLIC by default. Left as generated,
-- all three functions below ship callable by `anon` over
-- `/rest/v1/rpc/...`, and `expired_meal_photos` in particular would hand every
-- account's photo keys to anybody who asked. This is the same trap CLAUDE.md
-- records five functions having already fallen into; the `migrations` CI job is
-- what proves the revokes landed, because a local diff will go on reporting
-- clean either way.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.expired_meal_photos(IN p_limit integer);

CREATE FUNCTION public.claim_job_run (
  p_job           text,
  p_lease_seconds integer DEFAULT 900
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_job));

  -- `greatest` is a parser CONSTRUCT rather than a catalog function, so it
  -- cannot be schema-qualified under `search_path = ''` — and needs no
  -- qualification, there being no schema it could be shadowed from. The floor
  -- of one second is so that a caller passing zero does not turn the lease
  -- into "anything started before now", which is every row.
  if exists (
    select 1
      from public.job_runs r
     where r.job = p_job
       and r.finished_at is null
       and r.started_at > pg_catalog.now()
             - pg_catalog.make_interval(secs => greatest(p_lease_seconds, 1))
  ) then
    return null;
  end if;

  insert into public.job_runs (job) values (p_job) returning id into v_id;
  return v_id;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_job_run(text, integer) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.claim_job_run(text, integer) TO service_role;

CREATE FUNCTION public.expired_meal_photos (
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    id         uuid,
    photo_path text,
    item_name  text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select f.id, f.photo_path, f.item_name
    from public.food_logs f
    left join public.subscriptions s on s.user_id = f.user_id
   where f.photo_path is not null
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not public.is_entitled(f.user_id)
     -- Logged AFTER the paid period ended. See the note above: without this,
     -- a lapsed subscription hands the sweep every photograph the account ever
     -- took, on the night it lapses.
     and f.logged_at > coalesce(s.current_period_end, '-infinity'::timestamptz)
     -- And the grace period: that period must ALSO be more than sixty days
     -- gone. Null coalesces to -infinity, so an account that never subscribed
     -- has nothing to wait for.
     and coalesce(s.current_period_end, '-infinity'::timestamptz)
           < now() - pg_catalog.make_interval(
               days => public.lapsed_photo_grace_days()
             )
   order by f.logged_at
   -- `least`/`greatest` are parser CONSTRUCTS rather than catalog functions, so
   -- they cannot be schema-qualified: `pg_catalog.greatest(...)` is a "function
   -- does not exist" error even though the bare form resolves fine under
   -- `search_path = ''`. They need no qualification for the reason the prefix
   -- exists elsewhere in this file — there is no schema they could be shadowed
   -- from.
   limit least(greatest(p_limit, 1), 1000);
$function$;

REVOKE EXECUTE ON FUNCTION public.expired_meal_photos(integer) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.expired_meal_photos(integer) TO service_role;

CREATE FUNCTION public.finish_job_run (
  p_id     bigint,
  p_ok     boolean,
  p_detail jsonb   DEFAULT NULL::jsonb,
  p_error  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  update public.job_runs
     set finished_at = pg_catalog.now(),
         ok          = p_ok,
         detail      = p_detail,
         error       = pg_catalog.left(p_error, 2000)
   where id = p_id
     and finished_at is null;
$function$;

REVOKE EXECUTE ON FUNCTION public.finish_job_run(bigint, boolean, jsonb, text) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.finish_job_run(bigint, boolean, jsonb, text) TO service_role;

CREATE TABLE public.job_runs (
  id          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  job         text                     NOT NULL,
  started_at  timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  ok          boolean,
  detail      jsonb,
  error       text
);

ALTER TABLE public.job_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_runs
  ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.job_runs TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.job_runs TO authenticated;

GRANT ALL ON public.job_runs TO service_role;

CREATE INDEX job_runs_job_started_idx ON public.job_runs (job, started_at DESC);