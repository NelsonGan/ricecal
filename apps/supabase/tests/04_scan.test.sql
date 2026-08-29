-- ---------------------------------------------------------------------------
-- The scan cascade's database half.
--
-- The cascade itself runs in the scan-meal edge function; what the database
-- guarantees — and what this file asserts — is what happens to a scanned row
-- once it is written: a display_label changes what an entry SAYS without
-- touching what it COUNTS, the three-source coalesce in `food_log_details`
-- resolves in the right order, and the three functions a client may edit a
-- plate with cannot be made to lie about the total.
--
-- WHAT LEFT THIS FILE WITH THE ARCHETYPES
--
-- Three assertions about `public.archetypes` used to open it: that the list was
-- seeded, that the terminal "Mixed meal" sat at the id the edge function
-- hardcoded, and that no archetype priced a plate at nothing. The cascade has
-- no archetype floor any more — a scan that cannot say what the food is fails
-- and asks to be tried again — so the table is gone and the numbers below are
-- literals. They are the terminal row's old figures, kept so the arithmetic in
-- this file reads the way it always did.
--
-- WHAT LEFT THIS FILE WITH THE CATALOGUE
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

-- One plate's worth of figures, used as the fixture throughout.
\set fixture_kcal 600

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());


-- display_label changes the name, never the numbers ---------------------------
--
-- A scanned entry the cascade priced as an estimate, wearing the model's own
-- specific name over the blunter one the snapshot carries.

insert into public.food_logs
  (user_id, log_date, quantity, source, scan_id, display_label,
   item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
values
  (:'user_a', current_date, 1, 'camera',
   'e0000000-0000-4000-8000-000000000001', 'Nasi campur with rendang',
   'Rice with dishes', :fixture_kcal, 70.0, 20.0, 25.0, '1 serving', 1);

select is(
  (select food_name from public.food_log_details where user_id = :'user_a'),
  'Nasi campur with rendang',
  'food_log_details shows the display_label over the snapshot name'
);

select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  :fixture_kcal,
  'the labelled entry still counts its own calories'
);

select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  :fixture_kcal,
  'daily_nutrition includes the labelled entry — display_label breaks nothing'
);

-- Habits: a guessed entry never becomes a "usual at this time" suggestion.
--
-- This used to be a join to `foods` filtering on `is_estimate`/`is_archetype`.
-- The filter is now `food_id is not null`, and it catches the same cases for a
-- better reason: an estimate and a rebuilt plate are exactly the entries that
-- reference no catalogue row.
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
       'Fried chicken', :fixture_kcal, 70.0, 20.0, 25.0, '1 serving', 1
from public.food_logs e
where e.user_id = :'user_a';

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
  :fixture_kcal,
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
-- the plate half the fixture's figure, and the entry's own `quantity` never
-- moves — rescaling it would have dragged every macro along in lockstep, which
-- is how adding rice used to add fat.
select is(
  (select kcal from public.food_log_details where user_id = :'user_a'),
  (:fixture_kcal / 2),
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
  (:fixture_kcal / 2),
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
  :fixture_kcal,
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


-- Putting something ON the plate ----------------------------------------------
--
-- The list could only ever shrink until now. `add_ingredient` is the third and
-- last thing a client may do to a breakdown, and the interesting half of it is
-- what happens to an entry that has NO breakdown: `food_log_details` prefers
-- the sum of the parts over the row's own figures, so one added ingredient
-- would otherwise redefine a 600 kcal plate as the 90 kcal egg just put on it.
-- The function seeds the entry as its own first part to stop that, and these
-- assertions are that the seeding is exact rather than approximate.

insert into public.food_logs
  (user_id, log_date, quantity, source, item_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
values
  (:'user_a', current_date, 2, 'search', 'Roti canai',
   300, 39.0, 6.0, 13.0, '1 piece', 1);

select e.id as plain_id from public.food_logs e where e.user_id = :'user_a' limit 1 \gset

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format('select public.add_ingredient(%L::uuid, %L, 90, 1, 6, 7)', :'plain_id', 'Fried egg'),
  'the owner can put a food on an entry that had no breakdown'
);

-- Two rows: the entry as it was, and the thing just added to it.
select is(
  (select count(*)::integer from public.food_log_ingredients where food_log_id = :'plain_id'::uuid),
  2,
  'the entry became its own first part'
);

-- 300 kcal at a factor of 1, twice over, plus one 90 kcal egg. The seeded row
-- carries the entry's own base figures, factor AND quantity, so this is the
-- same arithmetic the view was already doing on the row itself.
select is(
  (select kcal from public.food_log_details where id = :'plain_id'::uuid),
  690,
  'the total is what the entry counted, plus what was added'
);

select lives_ok(
  format('select public.add_ingredient(%L::uuid, %L, 50, 12, 1, 0)', :'plain_id', 'Teh o ais'),
  'a second food goes on the same plate'
);

-- Three, not four: the parent is seeded once, when the list is empty.
select is(
  (select count(*)::integer from public.food_log_ingredients where food_log_id = :'plain_id'::uuid),
  3,
  'the parent is not seeded twice'
);

reset role;

-- Somebody else's diary. The function runs as security definer, so the owner
-- check inside it is the only thing standing between a uuid and a stranger's
-- plate.
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  format('select public.add_ingredient(%L::uuid, %L, 90, 1, 6, 7)', :'plain_id', 'Fried egg'),
  'P0001',
  'entry not found',
  'a stranger cannot add to someone else''s entry'
);

reset role;

-- An entry whose calorie total the user typed. The override sits ABOVE the
-- parts, so the plate would gain a row and not a calorie; refusing says so
-- where a silent no-op would read as the button not working.
insert into public.food_logs
  (user_id, log_date, quantity, source, item_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, override_kcal)
values
  (:'user_b', current_date, 1, 'search', 'Kaya toast',
   260, 30.0, 6.0, 12.0, '1 serving', 1, 400);

select e.id as typed_id from public.food_logs e where e.user_id = :'user_b' limit 1 \gset

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  format('select public.add_ingredient(%L::uuid, %L, 90, 1, 6, 7)', :'typed_id', 'Fried egg'),
  'P0001',
  'entry has typed figures',
  'an entry with a typed calorie figure refuses the addition'
);

reset role;


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
