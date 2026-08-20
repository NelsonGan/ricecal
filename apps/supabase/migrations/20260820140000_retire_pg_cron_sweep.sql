-- Retire the pg_cron sweep, its endpoint's credentials, and both extensions.
--
-- The photograph sweep is `apps/cloudflare/workers/jobs/src/jobs/retention.ts`
-- now, on a Cloudflare Cron Trigger. What goes here is everything the previous
-- arrangement needed and nothing else does:
--
--   the schedule            `cron.job` row `sweep-meal-photos`
--   the caller              `public.sweep_meal_photos()`
--   its history             `public.retention_runs`
--   its credentials         the `retention_token` and `retention_functions_url`
--                           vault secrets
--   the machinery           the `pg_cron` and `pg_net` extensions
--
-- WHY ALL OF IT RATHER THAN JUST THE SCHEDULE. The sweep ran as an edge
-- function with `verify_jwt = false` — a job acting for every account has no
-- user to authenticate — so it was a public URL that deletes photographs, held
-- shut by a shared secret in two places. Leaving the token in the vault and the
-- extensions installed would leave that endpoint one `cron.schedule` away from
-- being live again, and would leave a credential lying about for an endpoint
-- nobody is maintaining. The Worker has no hostname, so there is nothing here
-- that needs a key.
--
-- HAND-WRITTEN, AND IT HAS TO BE, for the same reason
-- `20260820120000_retention_runs_on_pg_cron.sql` was. `supabase db diff` does
-- not track extensions at all, and a cron schedule is a ROW in `cron.job`,
-- which a diff would never emit either. The two objects that ARE structure —
-- the table and the function — leave `schemas/35_retention.sql` in the same
-- commit; the note left in their place says what they were for.
--
-- ORDER MATTERS, and it is the repo's usual rule read backwards: stop the thing
-- that calls, then remove what it called. Unschedule before dropping the
-- function, or the next tick fires a job whose target has gone. In practice
-- `drop extension pg_cron` would take the schedule with it, but a job that
-- errors between the two statements is a log line nobody can interpret later.
--
-- EVERY STATEMENT IS IDEMPOTENT, so this survives being applied to a database
-- that never had any of it — a fresh local stack replays the whole migration
-- history, including the one that installed pg_cron ninety minutes earlier.

-- 1. Stop the schedule. Guarded on the extension still being installed, because
--    `cron.unschedule` does not exist otherwise and a fresh database rebuilt
--    from these migrations does have it at this point.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'sweep-meal-photos')
  then
    perform cron.unschedule('sweep-meal-photos');
  end if;
end $$;

-- 2. The caller and its history.
drop function if exists public.sweep_meal_photos();
drop table if exists public.retention_runs;

-- 3. The credentials the endpoint needed. Nothing else reads either, and both
--    are `retention_` by name; see the header for why they do not simply stay.
delete from vault.secrets
 where name in ('retention_token', 'retention_functions_url');

-- 4. The machinery. Checked first rather than relying on `if exists`, because
--    dropping one of these out from under a job somebody added since would be a
--    silent breakage — at the time of writing `sweep-meal-photos` was the only
--    row in `cron.job` and `sweep_meal_photos()` the only caller of `net.http`
--    anywhere in the database, both verified against production.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job)
  then
    raise exception 'pg_cron still has scheduled jobs; not dropping it'
      using hint = 'inspect `select jobname, schedule, command from cron.job`';
  end if;
end $$;

drop extension if exists pg_cron;
drop extension if exists pg_net;
