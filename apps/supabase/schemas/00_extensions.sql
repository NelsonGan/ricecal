-- ---------------------------------------------------------------------------
-- Extensions.
--
-- Supabase puts extensions in the `extensions` schema, not `public`, and
-- `config.toml` already lists it in `extra_search_path` so unqualified calls
-- resolve. Installing into `public` instead would put extension objects in the
-- same namespace the Data API exposes.
-- ---------------------------------------------------------------------------

-- Trigram matching for food search. The mock layer filtered an in-memory array
-- with `includes`; `%` and `similarity()` over a GIN index is the real thing,
-- and it tolerates the spelling variance these dish names attract
-- ("char kway teow" / "char kuey teow" / "chao kuey tiao").
create extension if not exists pg_trgm with schema extensions;

-- Accent folding, so "Café Latté" is reachable from "cafe latte". Only the
-- two-argument `unaccent(regdictionary, text)` is used: the one-argument form is
-- merely `stable`, because it resolves its dictionary through the search path,
-- and a normalizer that is not `immutable` cannot be indexed on.
create extension if not exists unaccent with schema extensions;
-- Outbound HTTP from inside Postgres, and the only caller is the retention
-- sweep's schedule: `pg_cron` fires `sweep_meal_photos()`, which POSTs to the
-- `retention` edge function because Postgres can reach neither R2 nor the
-- function's own logic. Asynchronous by nature — see `35_retention.sql` for
-- what that costs and what pays for it.
create extension if not exists pg_net with schema extensions;

-- The scheduler. One job, `sweep-meal-photos`, defined in a migration rather
-- than here: a schedule is a ROW in `cron.job`, and `supabase db diff` only
-- ever emits structure — the same reason `seed_archetype_foods()` is called
-- from the baseline migration instead of from a schema file.
--
-- Installed into `pg_catalog`, which is where Supabase's image puts it and
-- where it lands with no `with schema` clause. It creates its own `cron`
-- schema for the job table, and it only runs jobs in the database named by
-- `cron.database_name`, which is `postgres` here.
create extension if not exists pg_cron;
