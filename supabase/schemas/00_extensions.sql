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
