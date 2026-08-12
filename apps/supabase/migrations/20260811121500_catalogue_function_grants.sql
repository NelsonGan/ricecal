-- The revokes the diff did not emit.
--
-- `schemas/19_food_sources.sql`, `97_load_catalogue.sql` and `02_functions.sql`
-- all end with an explicit `revoke execute ... from public, anon, authenticated`,
-- and `supabase db diff` emitted none of them — the documented failure in
-- CLAUDE.md ("db diff misses function grants", five functions shipped executable
-- by PUBLIC this way). Supabase's own security advisor is what caught it:
-- `seed_food_sources` is SECURITY DEFINER and was reachable at
-- `/rest/v1/rpc/seed_food_sources` by `anon`.
--
-- A function is executable by PUBLIC the moment it is created, so a revoke that
-- does not reach a migration is a revoke that never happened anywhere except the
-- schema file it is written in. After touching grants, check `pg_proc.proacl`:
-- a leading `=X/postgres` means PUBLIC still has EXECUTE.

revoke execute on function public.seed_food_sources() from public, anon, authenticated;
revoke execute on function public.load_catalogue_batch(jsonb) from public, anon, authenticated;
revoke execute on function public.food_aliases_set_norm() from public, anon, authenticated;

-- `gtin14` is a pure string formatter with nothing behind it, and the client has
-- a legitimate use: normalizing a scanned code before it asks. Revoked from
-- PUBLIC and granted to the two roles that should have it, rather than left
-- open by default.
revoke execute on function public.gtin14(text) from public;
grant execute on function public.gtin14(text) to authenticated, service_role;

-- Signed-in only. It is `security invoker` so RLS already stops an anonymous
-- caller from seeing a row, but the grant is the outer gate and should say so.
revoke execute on function public.lookup_barcode(text) from public, anon;
grant execute on function public.lookup_barcode(text) to authenticated, service_role;
