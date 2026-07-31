-- ---------------------------------------------------------------------------
-- The scan cascade's database half.
--
-- The cascade itself runs in the scan-meal edge function; what the database
-- guarantees — and what this file asserts — is the floor under it: the
-- archetypes it falls back to always exist and always resolve, guesses never
-- leak into search or habits, an estimate is one shared row no matter how many
-- users produce it, and a display_label changes what an entry SAYS without
-- touching what it COUNTS.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

\set user_a '11111111-1111-1111-1111-111111111111'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());


-- The floor the cascade lands on ---------------------------------------------

-- Tier 5 classifies over this fixed list, so the list must be there on any
-- database the edge function points at. The count moves as archetypes are
-- curated; what cannot move is the order of magnitude.
select cmp_ok(
  (select count(*)::integer from public.foods where is_archetype),
  '>=', 50,
  'the archetype list is seeded'
);

-- The terminal row's id is a constant in the edge function — reached with no
-- model call and no search, so it has to exist at exactly this id.
select is(
  (select count(*)::integer from public.foods
   where id = 'a0000000-0000-4000-8000-000000000000' and is_archetype),
  1,
  'the terminal mixed-meal archetype exists at its hardcoded id'
);

-- An archetype the cascade cannot log against is a dead end wearing a
-- guarantee's clothes.
select is(
  (select count(*)::integer
   from public.foods f
   where f.is_archetype
     and not exists (select 1 from public.food_servings s where s.food_id = f.id and s.is_default)),
  0,
  'every archetype has a default portion to log against'
);


-- Guesses stay out of search and habits ---------------------------------------

-- "Fried rice" is both a seeded archetype and a plausible user query; the
-- archetype must not be the answer.
select is(
  (select count(*)::integer from public.search_foods('fried rice')
   where id in (select id from public.foods where is_archetype)),
  0,
  'search never returns an archetype row'
);

select lives_ok(
  $q$select public.upsert_estimate_food('Zzz Test Estimate Dish', 500, 60, 20, 18)$q$,
  'an estimate row can be created'
);

select is(
  (select count(*)::integer from public.search_foods('zzz test estimate dish')),
  0,
  'search never returns an estimate row, even on its exact name'
);


-- The cascade's search mode ----------------------------------------------------
--
-- `p_fuzzy => false` is what the edge function passes. It exists because the
-- trigram arm costs over a second per call and a plate with five components
-- makes five calls back to back — enough to trip the statement timeout, which
-- surfaced as a missing ingredient breakdown. The trade has to hold in both
-- directions: no fuzzy matching for the cascade, all of it for a human typing.

insert into public.foods (slug, name, place, kcal, carbs_g, protein_g, fat_g)
values ('fixture-zzznasilemak', 'Zzznasilemak', 'hawker', 500, 60, 20, 18);

insert into public.food_servings (food_id, slug, label, factor, is_default, position)
select f.id, 'plate', '1 plate', 1.0, true, 0
from public.foods f where f.slug = 'fixture-zzznasilemak';

select is(
  (select count(*)::integer from public.search_foods('zzznasilemk')),
  1,
  'the trigram arm still reaches a misspelling'
);

select is(
  (select count(*)::integer from public.search_foods(q => 'zzznasilemk', p_fuzzy => false)),
  0,
  'p_fuzzy => false drops the trigram arm'
);

select is(
  (select count(*)::integer from public.search_foods(q => 'zzznasilemak', p_fuzzy => false)),
  1,
  'a correctly spelled query still answers with the fuzzy arm off'
);

-- The other half of the flag: full text ORs its terms for a human narrating a
-- meal, and ANDs them for the cascade. ORed, one shared word drags in tens of
-- thousands of rows to rank, which is where the seconds went.
select is(
  (select count(*)::integer from public.search_foods('zzznasilemak with rendang')),
  1,
  'a forgiving search matches on one of its terms'
);

select is(
  (select count(*)::integer
   from public.search_foods(q => 'zzznasilemak with rendang', p_fuzzy => false)),
  0,
  'a strict search requires every term'
);


-- One estimate per dish per size, however it is spelt --------------------------

select is(
  public.upsert_estimate_food('Zzz Test Estimate Dish', 500, 60, 20, 18),
  public.upsert_estimate_food('  ZZZ test, estimate dish!  ', 510, 61, 20, 18),
  'estimates dedup on the normalized name — spelling and casing collapse to one row'
);

-- A plate of a different size is a different row. Reusing the 500 kcal row for
-- a 700 kcal photo would either log 200 kcal short or push `quantity` to 1.5 —
-- and one photo is one portion.
select isnt(
  public.upsert_estimate_food('Zzz Test Estimate Dish', 500, 60, 20, 18),
  public.upsert_estimate_food('Zzz Test Estimate Dish', 700, 80, 30, 25),
  'an estimate sized differently gets its own row'
);

select is(
  (select kcal from public.foods where is_estimate
   and name_norm = public.search_normalize('Zzz Test Estimate Dish (700 kcal)')),
  700,
  'the size-tagged row carries the size it was asked for'
);

-- And the reused row keeps its original figures: a later scan's opinion must
-- not overwrite a number a curator may have corrected.
select is(
  (select kcal from public.foods where is_estimate
   and name_norm = public.search_normalize('Zzz Test Estimate Dish')),
  500,
  'reusing an estimate row never rewrites its macros'
);

select is(
  (select count(*)::integer
   from public.foods f
   where f.is_estimate
     and not exists (select 1 from public.food_servings s where s.food_id = f.id and s.is_default)),
  0,
  'every estimate row has a default portion'
);


-- Taking an ingredient off the plate --------------------------------------------

-- Asserted at the end of the ingredient block below, where there is a plate to
-- take something off; see `remove_ingredient` there.


-- display_label changes the name, never the numbers ---------------------------

-- A scanned entry pointing at the terminal archetype, wearing the model's
-- specific name.
insert into public.food_logs (user_id, log_date, food_id, serving_id, quantity, source, scan_id, display_label)
select :'user_a', current_date,  f.id, s.id, 1, 'camera',
       'e0000000-0000-4000-8000-000000000001', 'Nasi campur with rendang'
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.id = 'a0000000-0000-4000-8000-000000000000';

select is(
  (select food_name from public.food_log_details where user_id = :'user_a'),
  'Nasi campur with rendang',
  'food_log_details shows the display_label over the archetype name'
);

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (select kcal from public.foods where id = 'a0000000-0000-4000-8000-000000000000'),
  'the labelled entry still counts the archetype row''s calories'
);

select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  (select kcal from public.foods where id = 'a0000000-0000-4000-8000-000000000000'),
  'daily_nutrition includes the labelled entry — display_label breaks nothing'
);

-- The flags the UI badges an estimate with travel through the view.
select is(
  (select is_archetype from public.food_log_details where user_id = :'user_a'),
  true,
  'food_log_details carries the archetype flag for the badge'
);

-- Habits: an archetype entry never becomes a "usual at this time" suggestion.
select is(
  (select count(*)::integer from public.user_food_stats where user_id = :'user_a'),
  0,
  'archetype entries stay out of user_food_stats'
);


-- Numbers the user typed --------------------------------------------------------
--
-- An override is per entry and per field: it wins over the computed figure,
-- and the fields it does not carry stay the catalogue's. Everything that sums
-- a day reads `food_log_details`, so this is the only place it has to hold.

update public.food_logs
set override_kcal = 275, override_protein_g = 31.5
where user_id = :'user_a';

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  275,
  'a typed calorie figure wins over the computed one'
);

select is(
  (select protein_g from public.food_log_details where user_id = :'user_a'),
  31.5::numeric,
  'and so does a typed macro'
);

select is(
  (select carbs_g from public.food_log_details where user_id = :'user_a'),
  (select round(f.carbs_g * s.factor * e.quantity, 1)
   from public.food_logs e
   join public.foods f on f.id = e.food_id
   join public.food_servings s on s.id = e.serving_id
   where e.user_id = :'user_a'),
  'a field left alone still comes from the catalogue'
);

select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  275,
  'the day total follows the override'
);

update public.food_logs
set override_kcal = null, override_protein_g = null
where user_id = :'user_a';


-- One plate, many ingredients --------------------------------------------------
--
-- A decomposed scan is ONE entry whose macros are the catalogue sum of its
-- parts; the parts hang off it in food_log_ingredients and ride the parent's
-- delete. The labelled archetype entry above serves as the parent.

insert into public.food_log_ingredients (food_log_id, food_id, serving_id, quantity, display_label, position)
select e.id, f.id, s.id, 1, 'crispy chicken', 0
from public.food_logs e,
     public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where e.user_id = :'user_a'
  and f.id = 'a0000000-0000-4000-8000-000000000000';

select is(
  (select count(*)::integer from public.food_log_ingredient_details i
   join public.food_logs e on e.id = i.food_log_id
   where e.user_id = :'user_a'),
  1,
  'an ingredient row appears in the details view'
);

select is(
  (select name from public.food_log_ingredient_details i
   join public.food_logs e on e.id = i.food_log_id
   where e.user_id = :'user_a'),
  'crispy chicken',
  'the ingredient shows its display_label over the food name'
);

select is(
  (select i.kcal from public.food_log_ingredient_details i
   join public.food_logs e on e.id = i.food_log_id
   where e.user_id = :'user_a'),
  (select kcal from public.foods where id = 'a0000000-0000-4000-8000-000000000000'),
  'the ingredient view prices the part from its catalogue row'
);

-- The one client write on a breakdown: an ingredient's portion, through the
-- owner-checked function that recomputes the parent in the same transaction.
select i.id as ing_id
from public.food_log_ingredients i
join public.food_logs e on e.id = i.food_log_id
where e.user_id = :'user_a'
limit 1 \gset

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format('select public.set_ingredient_quantity(%L::uuid, 0.5)', :'ing_id'),
  'the owner can change an ingredient portion'
);

select is(
  (select quantity from public.food_log_ingredients where id = :'ing_id'),
  0.50,
  'the ingredient carries the new portion'
);

-- The entry's numbers ARE its parts: the one 600 kcal ingredient at half a
-- portion makes the plate 300, and the entry's own `quantity` never moves —
-- rescaling it would have dragged every macro along in lockstep, which is how
-- adding rice used to add fat.
select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  300,
  'the entry total is the sum of its parts'
);

select is(
  (select quantity from public.food_logs where user_id = :'user_a'),
  1.00,
  'and the entry portion is left alone'
);

-- A typed figure still wins over the parts.
--
-- The three sources are ordered override, then parts, then the portion — and
-- the middle one is the newest, so this is the pair most able to drift. Someone
-- who reads a packet and types the real number has said something the app must
-- not talk over with its own arithmetic.
reset role;

update public.food_logs set override_kcal = 410 where user_id = :'user_a';

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  410,
  'a typed figure outranks the sum of the parts'
);

update public.food_logs set override_kcal = null where user_id = :'user_a';

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  300,
  'and clearing it hands the total back to the parts'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Off the plate entirely, which is a different answer from "a quarter of it".
select lives_ok(
  format('select public.remove_ingredient(%L::uuid)', :'ing_id'),
  'the owner can take an ingredient off the plate'
);

select is(
  (select count(*)::integer from public.food_log_ingredients where id = :'ing_id'),
  0,
  'the ingredient is gone'
);

-- An entry whose last part has gone is an entry with no breakdown, which is
-- what a dish the scan could not decompose looks like: the lateral join finds
-- nothing, the coalesce falls through, and the parent row prices its own
-- portion again. Reading a plate of nothing as zero calories is the failure
-- this guards against.
select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (select kcal from public.foods where id = 'a0000000-0000-4000-8000-000000000000'),
  'the last part removed falls back to the entry''s own portion'
);

reset role;

delete from public.food_logs where user_id = :'user_a';

-- Scoped to the fixture user: the database under test may hold other data.
select is(
  (select count(*)::integer from public.food_log_ingredients i
   where not exists (select 1 from public.food_logs e where e.id = i.food_log_id)),
  0,
  'deleting the entry cascades to its ingredients'
);


-- The paper trail is service_role's alone -------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $q$select count(*) from public.food_scan_items$q$,
  '42501',
  null,
  'a client cannot read the scan eval table'
);

reset role;

select * from finish();

rollback;
