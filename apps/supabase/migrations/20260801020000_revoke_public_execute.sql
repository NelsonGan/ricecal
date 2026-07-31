-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

-- Captured from `supabase db diff` in CI rather than locally. The declarative
-- workflow is what produced these five statements — the job that enforces it
-- printed them verbatim — but the same CLI version against a full local stack
-- reports no changes, so the ACL delta only surfaces on the throwaway database
-- CI builds. That gap is why they were missing in the first place: every
-- schema file below has said `revoke execute ... from public` since the day it
-- was written, and no migration ever carried it.
--
-- Postgres grants EXECUTE to PUBLIC on a newly created function, so until this
-- runs these five are callable by anyone holding the anon key. Nothing is
-- reachable through them today — none of them is SECURITY DEFINER, and `anon`
-- has no grant on `foods` — but that is the second lock doing the work of the
-- first, and `estimate_food_backlog` is already readable by any signed-in user
-- because `authenticated` does hold SELECT there.
--
--   32_food_scans.sql          upsert_estimate_food, estimate_food_backlog
--   33_archetypes.sql          seed_archetype_foods
--   34_food_log_ingredients.sql set_ingredient_quantity, remove_ingredient
--
-- The per-role grants those files declare are already in place; only the
-- revoke from PUBLIC is missing, which is why nothing below re-grants.

SET check_function_bodies = false;

REVOKE ALL ON FUNCTION public.estimate_food_backlog(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.remove_ingredient(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.seed_archetype_foods() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_ingredient_quantity(uuid, numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_estimate_food(text, integer, numeric, numeric, numeric, numeric, numeric, integer) FROM PUBLIC;
