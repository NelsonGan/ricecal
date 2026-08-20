-- ---------------------------------------------------------------------------
-- The scan cascade's database half.
--
-- The cascade itself runs in the scan-meal edge function; what the database
-- guarantees — and what this file asserts — is the floor under it: the
-- archetypes it falls back to always exist, a display_label changes what an
-- entry SAYS without touching what it COUNTS, and the three-source coalesce in
-- `food_log_details` resolves in the right order.
--
-- WHAT LEFT THIS FILE WITH THE CATALOGUE
begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

\set user_a '11111111-1111-1111-1111-111111111111'
\set terminal 'a0000000-0000-4000-8000-000000000000'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());


-- The floor the cascade lands on ---------------------------------------------
--
-- These are in Postgres rather than in D1 with the rest of the catalogue, and
-- that is the point: tier 5 is where a scan lands when the catalogue, the model
-- or the NETWORK has failed it, and a fallback reached over the network is not
-- a fallback.

-- Tier 5 classifies over this fixed list, so the list must be there on any
-- database the edge function points at. The count moves as archetypes are
-- curated; what cannot move is the order of magnitude.
select cmp_ok(
  (select count(*)::integer from public.archetypes),
  '>=', 50,
  'the archetype list is seeded'
);

-- The terminal row's id is a constant in the edge function — reached with no
-- model call and no query of any kind — so it has to exist at exactly this id.
select is(
  (select count(*)::integer from public.archetypes where id = :'terminal'::uuid),
  1,
  'the terminal archetype is at the id the edge function hardcodes'
);

-- Every archetype has to be able to price a plate. A zero would resolve a
-- failed scan to a free meal, which is the one direction a calorie app must
-- never round towards.
select is(
  (select count(*)::integer from public.archetypes where kcal <= 0),
  0,
  'no archetype prices a meal at nothing'
);


-- display_label changes the name, never the numbers ---------------------------
--
-- A scanned entry landing on the terminal archetype, wearing the model's own
-- specific name. The snapshot is what the cascade writes: the archetype's
-- figures, at "1 serving", which is the only portion an archetype has.

insert into public.food_logs
  (user_id, log_date, quantity, source, scan_id, display_label,
   item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
select :'user_a', current_date, 1, 'camera',
       'e0000000-0000-4000-8000-000000000001', 'Nasi campur with rendang',
       a.name, a.kcal, a.carbs_g, a.protein_g, a.fat_g, '1 serving', 1
from public.archetypes a where a.id = :'terminal'::uuid;

select is(
  (select food_name from public.food_log_details where user_id = :'user_a'),
  'Nasi campur with rendang',
  'food_log_details shows the display_label over the snapshot name'
);

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (select kcal from public.archetypes where id = :'terminal'::uuid),
  'the labelled entry still counts the archetype''s calories'
);

select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  (select kcal from public.archetypes where id = :'terminal'::uuid),
  'daily_nutrition includes the labelled entry — display_label breaks nothing'
);

-- Habits: a guessed entry never becomes a "usual at this time" suggestion.
--
-- This used to be a join to `foods` filtering on `is_estimate`/`is_archetype`.
-- The filter is now `food_id is not null`, and it catches the same three cases
-- for a better reason: an estimate, an archetype and a rebuilt plate are
-- exactly the entries that reference no catalogue row.
select is(
  (select count(*)::integer from public.user_food_stats where user_id = :'user_a'),
  0,
  'entries with no catalogue reference stay out of user_food_stats'
);


-- Numbers the user typed --------------------------------------------------------
--
-- An override is per entry and per field: it wins over the computed figure,
-- and the fields it does not carry stay the entry's own. Everything that sums
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
  (select round(e.base_carbs_g * e.serving_factor * e.quantity, 1)
   from public.food_logs e where e.user_id = :'user_a'),
  'a field left alone still comes from the entry''s own snapshot'
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
-- A decomposed scan is ONE entry whose macros are the sum of its parts; the
-- parts hang off it in food_log_ingredients and ride the parent's delete. The
-- labelled entry above serves as the parent.

insert into public.food_log_ingredients
  (food_log_id, quantity, display_label, position,
   item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
select e.id, 1, 'crispy chicken', 0,
       a.name, a.kcal, a.carbs_g, a.protein_g, a.fat_g, '1 serving', 1
from public.food_logs e, public.archetypes a
where e.user_id = :'user_a' and a.id = :'terminal'::uuid;

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
  'the ingredient shows its display_label over its snapshot name'
);

select is(
  (select i.kcal from public.food_log_ingredient_details i
   join public.food_logs e on e.id = i.food_log_id
   where e.user_id = :'user_a'),
  (select kcal from public.archetypes where id = :'terminal'::uuid),
  'the ingredient view prices the part from its own figures'
);

-- The one client write on a breakdown: an ingredient's portion, through the
-- owner-checked function.
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

-- The entry's numbers ARE its parts: the one ingredient at half a portion makes
-- the plate half the archetype's figure, and the entry's own `quantity` never
-- moves — rescaling it would have dragged every macro along in lockstep, which
-- is how adding rice used to add fat.
select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (select round(kcal / 2.0)::integer from public.archetypes where id = :'terminal'::uuid),
  'the entry total is the sum of its parts'
);

select is(
  (select quantity from public.food_logs where user_id = :'user_a'),
  1.00,
  'and the entry portion is left alone'
);

-- A typed figure still wins over the parts.
--
-- The three sources are ordered override, then parts, then the entry's own
-- portion — and the middle one is the newest, so this is the pair most able to
-- drift. Someone who reads a packet and types the real number has said
-- something the app must not talk over with its own arithmetic.
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
  (select round(kcal / 2.0)::integer from public.archetypes where id = :'terminal'::uuid),
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
-- what a dish the scan could not decompose looks like: the subquery finds
-- nothing, the coalesce falls through, and the row prices its own portion
-- again. Reading a plate of nothing as zero calories is the failure this
-- guards against.
select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (select kcal from public.archetypes where id = :'terminal'::uuid),
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
