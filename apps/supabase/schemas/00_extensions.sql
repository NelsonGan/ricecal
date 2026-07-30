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
