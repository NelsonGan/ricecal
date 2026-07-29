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

  icon_set       public.icon_set not null default 'dishes',
  icon_name      text not null,

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
  -- Where the numbers came from. A citation, and the audit trail for an
  -- imported row whose figures someone later disputes.
  source         text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint foods_slug_key unique (slug)
);

-- Trigram search over the name. `gin_trgm_ops` answers both `ILIKE '%tarik%'`
-- and `similarity(name, 'char kuey teow') > 0.3`, which is what makes the
-- search screen tolerant of spelling rather than exact-prefix only.
create index foods_name_trgm_idx
  on public.foods using gin (name extensions.gin_trgm_ops);

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
