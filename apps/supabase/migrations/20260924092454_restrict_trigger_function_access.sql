-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

-- pg-delta emits the final grants but misses the revokes that remove PUBLIC's default EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_recipe_author() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipes_reset_review() FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

GRANT ALL ON FUNCTION public.profiles_sync_recipe_author() TO service_role;

GRANT ALL ON FUNCTION public.recipes_reset_review() TO service_role;
