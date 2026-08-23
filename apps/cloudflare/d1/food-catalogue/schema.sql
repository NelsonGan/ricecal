-- The catalogue's schema, in D1.
--
-- WHY THIS FILE EXISTS
--
-- The diary's schema is declarative and versioned: `apps/supabase/schemas/*.sql`
-- is the source of truth, migrations are generated from it, a nightly job diffs
-- the deployed database against them, and a pgTAP suite asserts what matters.
-- The catalogue had none of that for a while. It moved to D1 and its tables
-- were created by hand against the live database, so the only description of
-- them was the database itself — nothing in git said what the shape was, and
-- nothing could rebuild it.
--
-- This file is that description. It is applied by hand rather than by a
-- migration runner, because the catalogue is DISPOSABLE in a way the diary is
-- not: an entry carries its own numbers, so every row here can be dropped and
-- reloaded from `apps/supabase/data/foods` and the barcode dump without a
-- single diary changing. "Rebuild it" is a real option here and it is not one
-- for Postgres, which is why this is a schema and not a migration chain.
--
--   pnpm exec wrangler d1 execute ricecal-d1-food-catalogue --remote --file schema.sql
--
-- Every statement is written to be safe to re-run.
--
-- WHAT IS NOT HERE
--
-- No foreign keys, and that is not laziness. `food_serving.food_id` and
-- `food_alias.food_id` name rows in `food`, and the loader writes all three
-- together; D1 leaves foreign keys off by default, and the recovery for a
-- dangling row is the same as the recovery for anything else wrong in here,
-- which is to reload. What a constraint would buy is not worth a write path
-- that has to order its statements around it.

-- ---------------------------------------------------------------------------
-- One aggregate for the marketing site's live search count.
--
-- This is telemetry, not catalogue content, so rebuilding the food and product
-- tables does not reset it. The fixed primary key makes it impossible to grow
-- into an event log by accident: one row, one number, updated by the catalogue
-- Worker after every completed public search.
-- ---------------------------------------------------------------------------
create table if not exists site_search_count (
  id         integer primary key check (id = 1),
  total      integer not null default 0 check (total >= 0),
  updated_at text not null default current_timestamp
);

insert or ignore into site_search_count (id, total) values (1, 0);

-- ---------------------------------------------------------------------------
-- The searchable catalogue: ~48,000 dishes and packaged goods people look up
-- by typing. Small ON PURPOSE — every row here is a competitor for rank, and
-- this table is scanned by four search arms on every query.
-- ---------------------------------------------------------------------------
create table if not exists food (
  id         text primary key,
  slug       text not null,
  name       text not null,
  brand      text,
  icon_set   text,
  icon_name  text,
  place      text not null,

  -- Per one base serving, which is `food_serving` where is_default = 1.
  kcal       integer not null,
  carbs_g    real not null,
  protein_g  real not null,
  fat_g      real not null,
  fibre_g    real,
  sugar_g    real,
  sodium_mg  integer,

  verified   integer not null default 0,
  barcode    integer,
  popularity integer not null default 0,
  is_local   integer not null default 0,

  source_id          text,
  source_name        text,
  source_attribution text,
  source_priority    integer not null default 0,

  -- The name as `normalize()` in the Worker writes it: accent-folded,
  -- lowercased, punctuation collapsed to single spaces.
  --
  -- A COLUMN rather than an expression, because the exact-name arm of the
  -- search compares a fully normalized query against it, and there is no way to
  -- spell that normalization in SQLite. It ran as `lower(name) = ?` for a
  -- while, which is two bugs in one line: a full table scan of all 48,000 rows
  -- on every single search, and a comparison that can never match any name
  -- containing punctuation — "Chicken Rice (Nasi Ayam)" is unreachable by its
  -- own words. Both are gone the moment this is a column with an index on it.
  name_norm  text
);

create unique index if not exists food_slug_idx on food (slug);
create index if not exists food_name_norm_idx on food (name_norm);

-- ---------------------------------------------------------------------------
-- A dish's other names, matched the way its name is.
--
-- Rows rather than tokens in a search bag, which is the distinction that makes
-- a second romanization findable: an alias among fifty words scores like one
-- word, and an alias in a table of its own scores like a name.
-- ---------------------------------------------------------------------------
create table if not exists food_alias (
  food_id text not null,
  alias   text not null,
  -- Normalized, and indexed, for the reason `food.name_norm` gives. This lookup
  -- was scanning all 25,000 aliases on every search.
  alias_norm text,
  primary key (food_id, alias)
) without rowid;

create index if not exists food_alias_norm_idx on food_alias (alias_norm);

-- ---------------------------------------------------------------------------
-- The portions a dish can be logged in. Keyed (food_id, slug), which is a
-- better key than an id of its own — a portion has no identity apart from the
-- dish it belongs to. The Worker mints "<food id>:<slug>" for callers that
-- need one string.
-- ---------------------------------------------------------------------------
create table if not exists food_serving (
  food_id    text not null,
  slug       text not null,
  label      text not null,
  factor     real not null,
  -- What this portion WEIGHS, when the source said. This is the column the scan
  -- cascade sizes a plate against, and the reason it is worth carrying: without
  -- it a weight has to be recovered from the label with a regex, which answers
  -- for "100 g" and gives up on "1 plate" — the way nearly every curated
  -- Malaysian dish states its portion.
  grams      real,
  is_default integer not null default 0,
  position   integer not null default 0,
  primary key (food_id, slug)
) without rowid;

-- ---------------------------------------------------------------------------
-- The barcode layer: 3.2 million packaged products, reachable by an exact code
-- and by nothing else.
--
-- Enormous on purpose, and separate from `food` on purpose. The two tables do
-- opposite jobs: name search wants to be small because every row competes for
-- rank, and barcode lookup wants to be vast because a row it will never match
-- costs nothing but disk. Keeping them in one table is what made fuzzy matching
-- unaffordable when this lived in Postgres.
--
-- `barcode integer primary key` IS the table in SQLite — a rowid alias — so a
-- lookup is a single b-tree descent with no secondary index to maintain.
-- ---------------------------------------------------------------------------
create table if not exists product (
  barcode   integer primary key,
  name      text not null,
  brand     text,
  kcal      integer not null,
  carbs_g   real not null,
  protein_g real not null,
  fat_g     real not null,
  serving_g real
);

-- ---------------------------------------------------------------------------
-- The full-text side.
--
-- Both indexes are CONTENTLESS (`content = ''`): FTS5 stores the terms and not
-- the text, because the text is already in `food` and storing it twice over
-- 48,000 rows buys nothing. The price is that a contentless table cannot look a
-- row up by rowid, so `fts_map` carries the rowid → food_id direction, and a
-- delete needs the original column values — which is why the loader rebuilds
-- these wholesale rather than editing them in place.
--
-- `food_fts` is ordinary word matching, accent-folded so that "kuih" and "kuıh"
-- are one word. `food_trgm` is the fuzzy arm, and it is the one thing that
-- needed rebuilding rather than porting from Postgres: `pg_trgm` scored
-- SIMILARITY, and FTS5's trigram tokenizer only matches substrings — a
-- misspelling is by definition not a substring of the right spelling. The
-- Worker splits the QUERY into trigrams instead and lets bm25 rank by how many
-- of them a row shares, which reconstructs similarity out of the primitive that
-- does exist.
-- ---------------------------------------------------------------------------
create table if not exists fts_map (
  rowid   integer primary key,
  food_id text not null
);

create index if not exists fts_map_food_idx on fts_map (food_id);

create virtual table if not exists food_fts using fts5(
  name, brand, aliases,
  content = '',
  tokenize = "unicode61 remove_diacritics 2"
);

create virtual table if not exists food_trgm using fts5(
  text,
  content = '',
  tokenize = "trigram remove_diacritics 1"
);
