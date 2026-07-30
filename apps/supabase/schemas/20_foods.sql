-- ---------------------------------------------------------------------------
-- The dish catalogue.
--
-- ONE SHARED CATALOGUE, READ ONLY TO CLIENTS
--
-- Every row here is visible to every signed-in user, and no client can write
-- one: there is no insert, update or delete grant for `authenticated` at all,
-- not merely no policy, so a policy added later by mistake cannot quietly turn
-- into a write path. Rows arrive from the import loader running as
-- `service_role`.
--
-- Users do not create dishes. A nullable `owner_id` used to carve private rows
-- out of this table; removing it is what makes `slug` a real identity — every
-- row has one and it is unique, rather than being null for the half of the
-- table that belonged to somebody.
--
-- MACROS ARE PER BASE SERVING
--
-- The numbers here describe exactly one of the serving marked `is_default` in
-- `food_servings` — one plate of nasi lemak, not 100 g of it. Every other
-- portion is that row's `factor` times these. Per-100g would have been the
-- more conventional choice and is wrong for this app: nobody weighs a roti
-- canai, and storing the base as the portion people actually name means the
-- common case needs no arithmetic and no rounding.
--
-- Entries reference this row rather than copying its macros, so correcting a
-- dish corrects every log that used it — including historical ones. That is
-- deliberate (a wrong calorie count was always wrong) and is the reason
-- `verified` exists: an unverified row is a guess that is expected to move.
-- ---------------------------------------------------------------------------

create table public.foods (
  id             uuid primary key default gen_random_uuid(),

  -- Stable handle ('nasi-lemak-ayam'), so the import loader is idempotent and
  -- so a test can name a dish without knowing its uuid.
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- Local spelling, unchanged in every language. Dish names are not copy and
  -- never go through i18n.
  name           text not null check (char_length(trim(name)) between 1 and 120),
  brand          text,

  -- Nullable, and both together or neither: an icon is a curated drawing and
  -- most foods do not have one. The catalogue runs to hundreds of megabytes of
  -- imported rows against a few dozen illustrations, so `not null` here forced
  -- every import to name a drawing it did not have — and what the app then
  -- showed was one stand-in plate beside a thousand different dishes, which
  -- looks like data and is not. A row with no icon renders none.
  icon_set       public.icon_set,
  icon_name      text,
  constraint foods_icon_complete check ((icon_set is null) = (icon_name is null)),

  place          public.food_place not null default 'hawker',

  -- Per one base serving.
  kcal           integer not null check (kcal between 0 and 10000),
  carbs_g        numeric(6, 1) not null default 0 check (carbs_g >= 0),
  protein_g      numeric(6, 1) not null default 0 check (protein_g >= 0),
  fat_g          numeric(6, 1) not null default 0 check (fat_g >= 0),
  -- Nullable, and null means unknown rather than zero. The nutrition screen
  -- currently derives fibre and sugar from carbohydrate because the mock
  -- catalogue had no columns for them; these are those columns, so that hack
  -- can be deleted as rows get filled in rather than rewritten.
  fibre_g        numeric(6, 1) check (fibre_g >= 0),
  sugar_g        numeric(6, 1) check (sugar_g >= 0),
  sodium_mg      integer check (sodium_mg >= 0),

  -- False means "a plausible estimate", true means someone checked it. Shown
  -- as a badge, and the flag a future catalogue-review queue sorts on.
  verified       boolean not null default false,

  -- Rows the scan cascade wrote from model knowledge (tier 4). Real catalogue
  -- rows in every mechanical sense — entries reference them, views join them —
  -- but excluded from `search_foods` and `user_food_stats`, because a guess
  -- must not surface as if someone had curated it. Deduped on `name_norm` (see
  -- the partial unique index below) so the same dish estimated twice shares one
  -- row: the number stays stable across users, stays correctable in one place,
  -- and the reference count becomes a ranking of what to curate next.
  is_estimate    boolean not null default false,

  -- The ~60 seeded generic fallbacks the scan cascade lands on when everything
  -- else fails ("fried rice", "noodle soup", terminal "mixed meal"). Resolved
  -- by classification over the fixed list, never by search, so also excluded
  -- from `search_foods`.
  is_archetype   boolean not null default false,
  -- Where the numbers came from. A citation, and the audit trail for an
  -- imported row whose figures someone later disputes.
  source         text,

  -- SEARCH
  --
  -- Two columns rather than one because they answer different questions.
  -- `name_norm` is this row's name, canonicalized, and is what a query is
  -- compared against for an exact hit or a trigram near-miss — short, so
  -- similarity stays meaningful. `search_text` is a bag of words: the name plus
  -- every alias, romanization, translation and category the loader knows, which
  -- is what full-text matches against. Scoring one long string on similarity
  -- would dilute it; scoring one short one on full text would lose the aliases.
  --
  -- Both are maintained by `foods_set_search`, so no write path can insert a row
  -- that search cannot see.
  name_norm      text not null default '',
  search_text    text not null default '',
  search_tsv     tsvector generated always as (
                   to_tsvector('pg_catalog.simple', search_text)
                 ) stored,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint foods_slug_key unique (slug)
);

-- Trigram search over the name. `gin_trgm_ops` answers both `ILIKE '%tarik%'`
-- and `similarity(name, 'char kuey teow') > 0.3`, which is what makes the
-- search screen tolerant of spelling rather than exact-prefix only.
create index foods_name_trgm_idx
  on public.foods using gin (name extensions.gin_trgm_ops);

-- The two indexes `search_foods` actually rides. The trigram one is on the
-- normalized name and not on `name`, because the query is normalized before it
-- is compared and matching a folded query against an unfolded column silently
-- loses every row with an accent or an apostrophe in it.
--
-- Partial, and this is the important part. Fuzzy matching exists for names
-- people spell inconsistently — Malaysian dishes and chain items, where the
-- romanization is genuinely unsettled. Packaged goods are 97% of the catalogue
-- and are not spelled approximately by anyone: nobody types a near-miss of
-- "STOUFFER'S CHICKEN & RICE", they type "stouffer" and full text finds it.
-- Including them made every short query pay for them — "milk" rechecked 60,934
-- rows and took 785 ms. Over the curated 15,000 the same query takes 11 ms.
create index foods_name_norm_trgm_idx
  on public.foods using gin (name_norm extensions.gin_trgm_ops)
  where place <> 'packaged';

-- The exact arm's `name_norm = <query>`. A GIN trigram index answers equality
-- too, so this looks redundant — but only over the rows it covers, and the one
-- above deliberately covers 3% of the table. Without this the exact arm
-- sequentially scanned all 463,587 rows on every search, which is the slowest
-- part of a query whose whole point is to be the fastest.
create index foods_name_norm_idx on public.foods (name_norm);

create index foods_search_tsv_idx
  on public.foods using gin (search_tsv);

-- The dedup rule for tier-4 estimates, as a constraint rather than a
-- read-then-write in the edge function: two users scanning "kolo mee special"
-- concurrently race, and only a unique index turns that race into one row. The
-- function upserts on it. Partial, so the real catalogue — where distinct
-- brands legitimately share a normalized name — is untouched.
create unique index foods_estimate_name_norm_idx
  on public.foods (name_norm) where is_estimate;

-- Ordered before `foods_set_updated_at` by name, which is how Postgres breaks
-- ties between two before-row triggers. Neither touches the other's columns, so
-- the order is documentation rather than a dependency.
create trigger foods_set_search
  before insert or update on public.foods
  for each row execute function public.foods_set_search();

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

-- Select only. The absence of the other three grants is the control; see the
-- header.
grant select on public.foods to authenticated;
grant select, insert, update, delete on public.foods to service_role;

create policy "foods: read catalogue"
  on public.foods for select
  to authenticated
  using (true);
