-- ---------------------------------------------------------------------------
-- The portions a dish comes in.
--
-- "1 plate", "Half", "100g" are data and not copy: a portion is named the same
-- way in every language this app will ship in, and putting them in the i18n
-- bundle would mean a dish could not add a portion without a release.
--
-- `factor` multiplies the food's base macros. The default serving is 1.0 by
-- definition — enforced, because a default of anything else silently rescales
-- the entire dish.
-- ---------------------------------------------------------------------------

create table public.food_servings (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references public.foods (id) on delete cascade,

  -- Stable within a food ('plate', 'half', 'g100'), so the seed can name one
  -- and an entry written against it survives a re-seed.
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label       text not null check (char_length(trim(label)) between 1 and 40),
  factor      numeric(6, 3) not null check (factor > 0 and factor <= 100),
  is_default  boolean not null default false,
  -- Ascending; ties broken by label. Controls the order of the portion picker.
  position    smallint not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint food_servings_slug_unique unique (food_id, slug),
  constraint food_servings_default_is_unit check (not is_default or factor = 1),
  -- Lets `food_logs` carry a composite foreign key and so guarantee that a
  -- entry's serving belongs to that entry's food. Without it the two columns
  -- are independently valid and jointly nonsense.
  constraint food_servings_food_id_id_key unique (food_id, id)
);

-- Exactly one default per dish. A partial unique index rather than a check,
-- because the constraint spans rows.
create unique index food_servings_one_default_idx
  on public.food_servings (food_id) where is_default;

create index food_servings_food_idx on public.food_servings (food_id);

create trigger food_servings_set_updated_at
  before update on public.food_servings
  for each row execute function public.set_updated_at();

alter table public.food_servings enable row level security;

-- Select only, matching `foods`. Portions are catalogue data and arrive with
-- the dish they belong to, from `service_role`.
grant select on public.food_servings to authenticated;
grant select, insert, update, delete on public.food_servings to service_role;

-- Visibility follows the dish, and every dish is shared, so this is `true` for
-- the same reason the policy on `foods` is.
create policy "food_servings: read with food"
  on public.food_servings for select
  to authenticated
  using (true);
