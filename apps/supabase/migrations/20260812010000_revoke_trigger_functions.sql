-- Two trigger functions were reachable as RPCs.
--
-- Postgres grants EXECUTE to PUBLIC on a newly created function and `anon`
-- inherits from PUBLIC, so `/rest/v1/rpc/recipes_before_insert` was callable by
-- anybody with the anon key. Calling one outside a trigger throws rather than
-- doing damage, but it is API surface nothing should have, and this repo has
-- shipped this exact class before — see the note on `db diff` missing function
-- grants in README.md, which is why this is a hand-written migration and not a
-- line in a schema file waiting for a diff that will not see it.
--
-- Scoped to the two `20260811160000_catalogue_moves_to_d1` recreated. Three more
-- are in the same state and predate all of this work — `handle_new_user`,
-- `profiles_sync_recipe_author`, `recipes_reset_review` — and are left alone
-- deliberately: `handle_new_user` sits on the `auth` trigger the diff already
-- sees too well, and changing three unrelated functions inside a catalogue
-- migration is how an unrelated regression gets attributed to the wrong change.

revoke execute on function public.recipes_before_insert() from public, anon, authenticated;
revoke execute on function public.recipe_ingredients_after_write() from public, anon, authenticated;
