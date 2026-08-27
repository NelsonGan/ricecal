-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER FUNCTION public.sync_daily_goals() SECURITY DEFINER;

-- Why: `weight_logs` cascades from `auth.users`, and its DELETE trigger runs
-- inside that cascade, which GoTrue performs as `supabase_auth_admin` — a role
-- with no privileges in `public`. Invoker-rights, the function's first
-- statement raised `permission denied for table profiles`, GoTrue answered
-- "Database error deleting user", and the `delete-account` function could
-- delete an account only if it had never recorded a weight. The full note is in
-- `schemas/80_goals_sync.sql`.

-- HAND-ADDED, because `supabase db diff` does not emit revokes. Postgres grants
-- EXECUTE on every function to PUBLIC, and `anon` inherits it; on a definer
-- function that is the difference between hygiene and a hole. Calling this one
-- directly raises ("trigger functions can only be called as triggers"), so
-- nothing is reachable through it either way — but the pattern is what the next
-- definer function will be copied from. Mirrors
-- `recipe_ingredients_after_write`, which is the other trigger in this schema
-- that fires inside the same cascade and has been definer all along.
revoke execute on function public.sync_daily_goals from public, anon, authenticated;
