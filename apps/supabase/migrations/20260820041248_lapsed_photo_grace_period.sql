-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.expired_meal_photos (
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    id         uuid,
    photo_path text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select f.id, f.photo_path
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

CREATE FUNCTION public.lapsed_photo_grace_days()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 60;
$function$;

GRANT ALL ON FUNCTION public.lapsed_photo_grace_days() TO authenticated;

GRANT ALL ON FUNCTION public.lapsed_photo_grace_days() TO service_role;
-- HAND-ADDED, and it has to be. `supabase db diff` does not emit revokes: it
-- wrote the two grants above and nothing about PUBLIC, which Postgres grants
-- EXECUTE to on every new function and which `anon` inherits. That is the exact
-- mechanism by which five functions once shipped executable by PUBLIC — see the
-- note in README.md — so the revoke from `schemas/35_retention.sql` is
-- copied here by hand rather than trusted to the diff.
--
-- The function returns a constant and leaks nothing, so this is hygiene rather
-- than a hole. It matters because the next person to add a `free_*`-shaped
-- helper will copy whichever pattern is already in the migrations.
revoke execute on function public.lapsed_photo_grace_days from public, anon;
grant execute on function public.lapsed_photo_grace_days to authenticated, service_role;
