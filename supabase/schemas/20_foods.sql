-- ---------------------------------------------------------------------------
-- The dish catalogue.
--
-- ONE TABLE FOR TWO KINDS OF ROW
--
-- `owner_id is null` is the shared catalogue everybody sees; `owner_id = <a
-- user>` is a dish that user created. A separate `custom_foods` table would
-- have meant every read that touches food doing a union, every join in
-- `food_logs` choosing between two foreign keys, and the search screen
-- merging two result sets by hand. One table with a nullable owner costs one
-- clause in one policy.
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

  -- Null for the shared catalogue, set for a dish one user created.
  owner_id       uuid references auth.users (id) on delete cascade,

  -- Stable handle for catalogue rows ('nasi-lemak-ayam'), so the seed migration
  -- is idempotent and so a fixture can name a dish without knowing its uuid.
  -- Null on user-created foods, which have no stable identity to name.
  slug           text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- Local spelling, unchanged in every language. Dish names are not copy and
  -- never go through i18n.
  name           text not null check (char_length(trim(name)) between 1 and 120),
  brand          text,

  icon_set       public.icon_set not null default 'dishes',
  icon_name      text not null,
  -- A photo the user took of their own dish, as a path inside `meal-photos`.
  -- Null on every catalogue row: the shared dishes are illustrated, and an
  -- illustration is what a row falls back to when this is empty — which is why
  -- `icon_name` stays required rather than becoming one of two options.
  image_path     text,

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
  -- Where the numbers came from: a citation for catalogue rows, null for a
  -- dish the user typed in.
  source         text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A slug identifies a catalogue row. Two users may both create "Mum's curry"
  -- and neither gets a slug, so the uniqueness is scoped to the shared rows.
  constraint foods_owner_has_no_slug check (owner_id is null or slug is null)
);

create unique index foods_slug_key on public.foods (slug) where owner_id is null;

-- Trigram search over the name. `gin_trgm_ops` answers both `ILIKE '%tarik%'`
-- and `similarity(name, 'char kuey teow') > 0.3`, which is what makes the
-- search screen tolerant of spelling rather than exact-prefix only.
create index foods_name_trgm_idx
  on public.foods using gin (name extensions.gin_trgm_ops);

-- "My custom dishes", and the cascade path when an account is deleted.
create index foods_owner_idx on public.foods (owner_id) where owner_id is not null;

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

grant select, insert, update, delete on public.foods to authenticated;
grant select, insert, update, delete on public.foods to service_role;

-- The shared catalogue is readable by every signed-in user; a custom dish is
-- readable only by the user who made it.
create policy "foods: read catalogue and own"
  on public.foods for select
  to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

-- `owner_id is not null` in the check is what stops a client inserting a row
-- into the shared catalogue. Catalogue rows come from migrations and from
-- service_role, never from a phone.
create policy "foods: insert own"
  on public.foods for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "foods: update own"
  on public.foods for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "foods: delete own"
  on public.foods for delete
  to authenticated
  using (owner_id = (select auth.uid()));
