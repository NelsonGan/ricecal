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
-- THERE IS NO `pg_cron` AND NO `pg_net` HERE, AND THAT IS DELIBERATE.
--
-- Both were installed for one caller: the retention sweep's schedule, where
-- `pg_cron` fired `sweep_meal_photos()` and `pg_net` POSTed to an edge
-- function, because Postgres can reach neither R2 nor the logic. That made the
-- sweep a public HTTPS endpoint that deletes photographs, guarded by a shared
-- secret, because a job acting for every account has no user to authenticate.
--
-- Anything periodic is a Cloudflare Worker on a Cron Trigger now
-- (`apps/cloudflare/workers/jobs`), which has no hostname at all. Nothing in
-- this database schedules anything, and nothing in it makes an outbound
-- request. Adding either extension back would mean re-opening that question,
-- so do it only with the answer in hand.
--
-- Worth knowing if you go looking: `supabase db diff` does not track
-- extensions, so neither their arrival nor their removal can come from a diff.
-- `20260820140000_retire_pg_cron_sweep.sql` drops them by hand.
--
-- AND `pg_net` IS DROPPED HERE AS WELL, which is the one odd statement in this
-- file. The Supabase base image installs it, and the shadow database a diff is
-- built in comes from that image — so with the migration dropping it and this
-- file silent, every `supabase db diff` from now on would emit a spurious
-- `CREATE EXTENSION pg_net` for ever. Measured, not guessed: that is exactly
-- what the first diff after the migration produced. Stating the absence makes
-- the declarative file say what is true — this database does not have pg_net —
-- and diffs go quiet.
--
-- `pg_cron` needs no such line, because the image does not install it.
drop extension if exists pg_net;
