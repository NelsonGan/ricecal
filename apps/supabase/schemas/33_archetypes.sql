-- ---------------------------------------------------------------------------
-- The archetype fallbacks — tier 5 of the scan cascade.
--
-- ~60 generic rows ("fried rice", "noodle soup", a terminal "mixed meal") that
-- the cascade lands on when the catalogue, the vision model or the network has
-- failed it. They are resolved by CLASSIFICATION over this fixed list, never by
-- search, which is what makes tier 5 unable to return no-match: the worst
-- answer it can give is the terminal row, whose id is a constant the edge
-- function carries so that reaching it needs no model call and no query.
--
-- WHY THIS IS A TABLE OF ITS OWN
--
-- These used to be `foods` rows with `is_archetype`, written by this function
-- into the catalogue. The catalogue is in Cloudflare D1 now, and putting the
-- archetypes there with it would have made the fallback for "the network failed"
-- another network call. They are sixty rows; they stay next to the diary.
--
-- The macros are one figure per archetype, chosen as the middle of the range
-- the catalogue holds for that family of dishes — a deliberate median, not a
-- model's opinion, so the number a failed scan produces is defensible and
-- stable. They live in this function rather than in a CSV so that re-running
-- it is the way to correct one everywhere at once.
--
-- There is no serving list any more. Every archetype had the same three
-- portions ("1 serving", "Half", "Large") and the cascade only ever chose the
-- first, because a tier-5 answer picks a food and expresses the size as the
-- quantity beside it. The other two were reachable only from the portion sheet
-- on an entry already logged, which now offers them from the entry's own
-- snapshot rather than from a catalogue row.
--
-- Seeding is a FUNCTION rather than inserts in this file because schema files
-- only shape the shadow database during `db diff` — data written here would
-- never reach a migration. A data migration calls it once, and calling it
-- again is always safe: it upserts on slug.
-- ---------------------------------------------------------------------------

create table if not exists public.archetypes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  kcal       integer not null,
  carbs_g    numeric(6, 1) not null,
  protein_g  numeric(6, 1) not null,
  fat_g      numeric(6, 1) not null
);

alter table public.archetypes enable row level security;

-- Readable by anyone signed in, and written by nobody but the seed. There is
-- nothing private here — it is sixty generic dishes — and the client does not
-- read it at all today; the grant exists so that a future "we could not read
-- your photo, was it one of these?" does not need a new policy.
create policy "archetypes: read" on public.archetypes
  for select to authenticated using (true);

grant select on public.archetypes to authenticated;
grant select, insert, update, delete on public.archetypes to service_role;

create or replace function public.seed_archetype_foods()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select * from (values
      -- The terminal row. Its id is hardcoded in the scan edge function; if it
      -- ever changes, change it there too.
      ('a0000000-0000-4000-8000-000000000000'::uuid, 'archetype-mixed-meal',      'Mixed meal',              600, 70.0, 20.0, 25.0),
      (null::uuid, 'archetype-mixed-meal-light',     'Mixed meal, light',         400, 45.0, 15.0, 16.0),
      (null::uuid, 'archetype-mixed-meal-large',     'Mixed meal, large',         850, 95.0, 30.0, 36.0),

      -- Rice
      (null::uuid, 'archetype-fried-rice',           'Fried rice',                640, 82.0, 18.0, 26.0),
      (null::uuid, 'archetype-steamed-rice',         'Steamed rice',              205, 45.0,  4.0,  0.5),
      (null::uuid, 'archetype-nasi-lemak',           'Nasi lemak',                650, 75.0, 18.0, 30.0),
      (null::uuid, 'archetype-rice-with-dishes',     'Rice with dishes',          620, 75.0, 25.0, 24.0),
      (null::uuid, 'archetype-biryani',              'Biryani rice',              700, 90.0, 25.0, 26.0),
      (null::uuid, 'archetype-porridge',             'Rice porridge',             220, 40.0, 10.0,  3.0),

      -- Noodles and pasta
      (null::uuid, 'archetype-fried-noodles',        'Fried noodles',             660, 80.0, 20.0, 28.0),
      (null::uuid, 'archetype-noodle-soup',          'Noodle soup',               400, 55.0, 20.0, 10.0),
      (null::uuid, 'archetype-laksa',                'Laksa',                     550, 60.0, 22.0, 25.0),
      (null::uuid, 'archetype-pasta-tomato',         'Pasta, tomato sauce',       450, 70.0, 15.0, 12.0),
      (null::uuid, 'archetype-pasta-creamy',         'Pasta, cream sauce',        620, 65.0, 20.0, 32.0),
      (null::uuid, 'archetype-instant-noodles',      'Instant noodles',           380, 52.0,  8.0, 15.0),

      -- Bread and wraps
      (null::uuid, 'archetype-sandwich',             'Sandwich',                  350, 40.0, 15.0, 14.0),
      (null::uuid, 'archetype-burger',               'Burger',                    550, 45.0, 25.0, 29.0),
      (null::uuid, 'archetype-pizza-slice',          'Pizza slice',               285, 33.0, 12.0, 11.0),
      (null::uuid, 'archetype-bread-roll',           'Bread roll',                180, 32.0,  5.0,  3.0),
      (null::uuid, 'archetype-roti-canai',           'Roti canai',                300, 40.0,  6.0, 12.0),
      (null::uuid, 'archetype-naan',                 'Naan / flatbread',          260, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-toast',                'Toast with spread',         200, 26.0,  4.0,  9.0),
      (null::uuid, 'archetype-pau',                  'Steamed bun',               280, 45.0,  9.0,  6.0),
      (null::uuid, 'archetype-kebab-wrap',           'Kebab / wrap',              550, 50.0, 28.0, 26.0),

      -- Small plates
      (null::uuid, 'archetype-dumplings',            'Dumplings',                 320, 40.0, 14.0, 11.0),
      (null::uuid, 'archetype-sushi-roll',           'Sushi roll',                300, 55.0, 10.0,  4.0),
      (null::uuid, 'archetype-spring-rolls',         'Spring rolls',              250, 28.0,  8.0, 12.0),
      (null::uuid, 'archetype-satay',                'Satay skewers',             350, 12.0, 28.0, 21.0),

      -- Protein mains
      (null::uuid, 'archetype-fried-chicken',        'Fried chicken',             430, 15.0, 30.0, 27.0),
      (null::uuid, 'archetype-grilled-chicken',      'Grilled chicken',           300,  2.0, 40.0, 14.0),
      (null::uuid, 'archetype-chicken-curry',        'Chicken curry',             450, 12.0, 30.0, 30.0),
      (null::uuid, 'archetype-beef-stew',            'Beef stew / rendang',       400, 15.0, 35.0, 22.0),
      (null::uuid, 'archetype-steak',                'Steak',                     450,  2.0, 40.0, 30.0),
      (null::uuid, 'archetype-grilled-fish',         'Grilled fish',              250,  2.0, 35.0, 11.0),
      (null::uuid, 'archetype-fried-fish',           'Fried fish',                350, 12.0, 28.0, 20.0),
      (null::uuid, 'archetype-seafood-dish',         'Seafood dish',              300, 10.0, 30.0, 15.0),
      (null::uuid, 'archetype-tofu-dish',            'Tofu dish',                 250, 12.0, 15.0, 16.0),
      (null::uuid, 'archetype-egg-dish',             'Egg dish',                  180,  2.0, 12.0, 14.0),
      (null::uuid, 'archetype-curry-dish',           'Curry dish',                400, 20.0, 20.0, 26.0),

      -- Vegetables, soups, salads
      (null::uuid, 'archetype-stir-fried-vegetables','Stir-fried vegetables',     120, 10.0,  4.0,  8.0),
      (null::uuid, 'archetype-steamed-vegetables',   'Steamed vegetables',         60, 10.0,  3.0,  1.0),
      (null::uuid, 'archetype-salad',                'Salad with dressing',       180, 12.0,  5.0, 12.0),
      (null::uuid, 'archetype-clear-soup',           'Clear soup',                120, 10.0,  8.0,  5.0),
      (null::uuid, 'archetype-creamy-soup',          'Creamy soup',               250, 20.0,  8.0, 15.0),

      -- Drinks
      (null::uuid, 'archetype-teh-tarik',            'Milk tea',                  130, 20.0,  3.0,  4.0),
      (null::uuid, 'archetype-kopi',                 'Coffee with milk',          120, 18.0,  3.0,  4.0),
      (null::uuid, 'archetype-black-coffee-tea',     'Black coffee / plain tea',    5,  1.0,  0.0,  0.0),
      (null::uuid, 'archetype-soft-drink',           'Soft drink',                140, 35.0,  0.0,  0.0),
      (null::uuid, 'archetype-fruit-juice',          'Fruit juice',               120, 28.0,  1.0,  0.2),
      (null::uuid, 'archetype-bubble-tea',           'Bubble tea',                350, 60.0,  5.0, 10.0),
      (null::uuid, 'archetype-beer',                 'Beer',                      150, 12.0,  1.0,  0.0),
      (null::uuid, 'archetype-protein-shake',        'Protein shake',             200, 15.0, 25.0,  4.0),

      -- Sweets and snacks
      (null::uuid, 'archetype-cake-slice',           'Cake slice',                350, 45.0,  5.0, 17.0),
      (null::uuid, 'archetype-cookies',              'Cookies / biscuits',        150, 20.0,  2.0,  7.0),
      (null::uuid, 'archetype-ice-cream',            'Ice cream',                 250, 28.0,  4.0, 13.0),
      (null::uuid, 'archetype-kuih',                 'Local kuih',                180, 30.0,  2.0,  6.0),
      (null::uuid, 'archetype-donut-pastry',         'Donut / pastry',            300, 35.0,  5.0, 16.0),
      (null::uuid, 'archetype-chocolate',            'Chocolate bar',             250, 28.0,  3.0, 14.0),
      (null::uuid, 'archetype-chips',                'Chips / crisps',            270, 26.0,  3.0, 17.0),
      (null::uuid, 'archetype-fried-snack',          'Fried snack',               250, 28.0,  4.0, 14.0),
      (null::uuid, 'archetype-nuts',                 'Nuts, a handful',           180,  6.0,  6.0, 15.0),
      (null::uuid, 'archetype-yoghurt',              'Yoghurt',                   120, 15.0,  6.0,  4.0),
      (null::uuid, 'archetype-cereal',               'Cereal with milk',          250, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-pancakes',             'Pancakes / waffles',        350, 50.0,  8.0, 13.0),
      (null::uuid, 'archetype-fruit',                'Fruit, one serving',         90, 22.0,  1.0,  0.5)
    ) as t (id, slug, name, kcal, carbs_g, protein_g, fat_g)
  loop
    insert into public.archetypes (id, slug, name, kcal, carbs_g, protein_g, fat_g)
    values (coalesce(r.id, pg_catalog.gen_random_uuid()), r.slug, r.name,
            r.kcal, r.carbs_g, r.protein_g, r.fat_g)
    on conflict (slug) do update set
      name       = excluded.name,
      kcal       = excluded.kcal,
      carbs_g    = excluded.carbs_g,
      protein_g  = excluded.protein_g,
      fat_g      = excluded.fat_g;
  end loop;
end;
$$;

comment on function public.seed_archetype_foods is
  'Upserts the ~60 tier-5 archetype rows. Idempotent; called from a data '
  'migration and safe to re-run to correct a figure.';

revoke execute on function public.seed_archetype_foods from public, anon, authenticated;
grant execute on function public.seed_archetype_foods to service_role;
