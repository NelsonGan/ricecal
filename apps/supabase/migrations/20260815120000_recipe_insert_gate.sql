-- The recipe publishing gate was enforced only on UPDATE. The INSERT grant on
-- public.recipes was table-wide, so a signed-in client could create a recipe
-- already `is_public = true, review_status = 'approved'` and land it in the
-- community tab having never been reviewed — `recipes_before_insert` mints the
-- share slug and the author name but does not touch these columns, so the row's
-- own values stood. This closes it the same way the update grant does: a
-- column-level insert grant that excludes `is_public` and `review_status`, so a
-- client that names either gets a 42501 privilege error.
--
-- `db diff` does not carry grants (a revoke that lives only in a schema file
-- never reaches a migration), so this is hand-written, matching the pattern of
-- 20260812010000_revoke_trigger_functions.sql.
revoke insert on public.recipes from authenticated;
grant insert (owner_id, name, servings, steps, icon_set, icon_name, photo_path)
  on public.recipes to authenticated;
