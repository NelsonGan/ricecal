-- Data, not schema, which is why this migration is hand-written: the archetype
-- rows live in `public.seed_archetype_foods()` (schemas/33_archetypes.sql) and
-- schema files cannot ship data through `db diff`. Idempotent — the function
-- upserts on slug — so re-running it is how a figure gets corrected.
select public.seed_archetype_foods();
