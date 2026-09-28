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

select plan(58);

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


-- The drawing survives a photograph -------------------------------------------
--
-- `item_icon_*` is what the FOOD looks like and `photo_path` is a picture of
-- this plate, so the two are not alternatives and the view stopped treating
-- them as a pair. It used to null both icon columns whenever a photo existed,
-- which put the rendering order (photo, then drawing, then the placeholder) in
-- the view rather than in the row that draws it — and cost the drawing
-- everywhere the photograph is not being shown. "Past foods" is the one that
-- reads: logging a photographed meal again copies the snapshot and not the
-- picture, so the new row came out as an empty plate.

update public.food_logs
   set photo_path     = 'meals/' || :'user_a' || '/plate.jpg',
       item_icon_set  = 'dishes',
       item_icon_name = 'nasi-campur'
 where user_id = :'user_a';

select is(
  (select icon_name from public.food_log_details where user_id = :'user_a'),
  'nasi-campur',
  'a photographed entry still states the drawing of the food it is'
);

-- And the row it belongs to still has the photograph, so nothing downstream has
-- to guess which of the two it was handed.
select is(
  (select photo_path is not null from public.food_log_details where user_id = :'user_a'),
  true,
  'the photograph comes with it, and the screen picks'
);

-- The user's own choice still wins over the food's, which is the half of the
-- old expression that was never in question.
update public.food_logs
   set photo_path = null, icon_set = 'food', icon_name = 'coconut'
 where user_id = :'user_a';

select is(
  (select icon_name from public.food_log_details where user_id = :'user_a'),
  'coconut',
  'an entry drawn by hand overrides the food it was logged against'
);

update public.food_logs
   set icon_set = null, icon_name = null, item_icon_set = null, item_icon_name = null
 where user_id = :'user_a';

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

-- Each addition lands AFTER what is already there, and the positions are read
-- off the rows rather than counted. A plate somebody has removed the middle of
-- has fewer parts than its highest position, so a row numbered by the count
-- would land on top of one that is still there — and `food_log_ingredient_details`
-- is ordered by this column, so two rows sharing a number is a list that
-- reorders itself between reads.
select is(
  (select array_agg(position order by position)
   from public.food_log_ingredients where food_log_id = :'plain_id'::uuid),
  array[0, 1, 2]::smallint[],
  'each part is added after the last, at its own position'
);

reset role;

-- The middle one goes, and the next addition still lands last rather than
-- reusing the number the count would have given it.
select i.id as middle_id
from public.food_log_ingredients i
where i.food_log_id = :'plain_id'::uuid and i.position = 1 \gset

delete from public.food_log_ingredients where id = :'middle_id'::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format('select public.add_ingredient(%L::uuid, %L, 40, 8, 1, 0)', :'plain_id', 'Kopi o'),
  'a food goes onto a plate with a gap in it'
);

select is(
  (select array_agg(position order by position)
   from public.food_log_ingredients where food_log_id = :'plain_id'::uuid),
  array[0, 2, 3]::smallint[],
  'and it lands past the highest position rather than on top of one'
);

-- A part given a position of its own takes that one instead, which is what
-- REPLACING an ingredient needs: the app adds the new part where the old one
-- sat and removes the old one after, so the swap does not move the row to the
-- bottom of the plate. The two share a number for as long as that takes.
--
-- Worth its own case because the null path is easy to break from here:
-- `greatest(0, null)` is 0 rather than null, so a `coalesce` around it would
-- send every ordinary addition to the top of the plate.
select lives_ok(
  format('select public.add_ingredient(%L::uuid, %L, 55, 9, 2, 1, 1, null, null, null, null, 2::smallint)',
         :'plain_id', 'Teh tarik'),
  'a food goes on at a position it was given'
);

select is(
  (select array_agg(position order by position)
   from public.food_log_ingredients where food_log_id = :'plain_id'::uuid),
  array[0, 2, 2, 3]::smallint[],
  'and it lands exactly there rather than after the last'
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


-- How much of the plate was eaten ---------------------------------------------
--
-- A photographed plate is priced whole, and a plate is not always finished.
-- `plate_quantity` scales the sum of the parts in one place, so half a plate is
-- half of every part at once, and it scales nothing on an entry without parts.

insert into public.food_logs
  (user_id, log_date, quantity, source, item_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g, base_fibre_g,
   serving_label, serving_factor)
values
  (:'user_a', current_date, 1, 'camera', 'Nasi lemak',
   580, 62.0, 20.0, 26.0, 4.0, '1 serving', 1);

select e.id as half_id from public.food_logs e
where e.user_id = :'user_a' and e.item_name = 'Nasi lemak' \gset

-- 400 + 2 x 90: the rice and two eggs.
insert into public.food_log_ingredients
  (food_log_id, quantity, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, position)
values
  (:'half_id', 1, 'Coconut rice', 400, 60.0, 8.0, 12.0, '1 plate', 1, 0),
  (:'half_id', 2, 'Fried egg', 90, 1.0, 6.0, 7.0, '1 egg', 1, 1);

select i.id as egg_id from public.food_log_ingredients i
where i.food_log_id = :'half_id'::uuid and i.item_name = 'Fried egg' \gset
select i.id as rice_id from public.food_log_ingredients i
where i.food_log_id = :'half_id'::uuid and i.item_name = 'Coconut rice' \gset

select is(
  (select array[kcal, ingredient_count] from public.food_log_details where id = :'half_id'::uuid),
  array[580, 2],
  'a plate starts whole, and the entry says how many parts it has'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Written straight onto the row, the way the portion stepper writes it.
select lives_ok(
  format('update public.food_logs set plate_quantity = 0.5 where id = %L', :'half_id'),
  'the owner can say how much of the plate was eaten'
);

select is(
  (select array[kcal::numeric, carbs_g, protein_g, fat_g]
   from public.food_log_details where id = :'half_id'::uuid),
  array[290, 31.0, 10.0, 13.0]::numeric[],
  'half a plate is half of every part at once'
);

-- Fibre, sugar and salt are the parent's own rather than the parts', and they
-- follow the plate too: 4 g of fibre on a half-eaten plate is 2.
select is(
  (select fibre_g from public.food_log_details where id = :'half_id'::uuid),
  2.0,
  'the nutrients outside the budget follow the plate as well'
);

-- The parts are the plate as it was served, so a part's count and its calories
-- keep describing the same amount.
select is(
  (select sum(kcal)::integer from public.food_log_ingredient_details
   where food_log_id = :'half_id'::uuid),
  580,
  'the parts still describe the whole plate'
);

reset role;

-- A typed figure still outranks the arithmetic, portion and all.
update public.food_logs set override_kcal = 350 where id = :'half_id'::uuid;

select is(
  (select kcal from public.food_log_details where id = :'half_id'::uuid),
  350,
  'a typed figure outranks half a plate'
);

update public.food_logs set override_kcal = null where id = :'half_id'::uuid;

-- Nothing multiplies it on an entry without parts, so a value there cannot move
-- a total, and the view reads 1 so no reader has to ask which case it is in.
insert into public.food_logs
  (user_id, log_date, quantity, source, item_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, plate_quantity)
values
  (:'user_a', current_date, 1, 'search', 'Teh tarik',
   120, 18.0, 3.0, 4.0, '1 cup', 1, 0.5);

select e.id as tea_id from public.food_logs e
where e.user_id = :'user_a' and e.item_name = 'Teh tarik' \gset

select is(
  (select array[kcal::numeric, plate_quantity, ingredient_count]
   from public.food_log_details where id = :'tea_id'::uuid),
  array[120, 1, 0]::numeric[],
  'an entry with no parts ignores the plate portion'
);

select throws_ok(
  format('update public.food_logs set plate_quantity = 0 where id = %L', :'half_id'),
  '23514',
  null,
  'a plate portion of nothing is refused'
);

select throws_ok(
  format('update public.food_logs set plate_quantity = 25 where id = %L', :'half_id'),
  '23514',
  null,
  'and so is one past twenty plates'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format('select public.remove_ingredient(%L::uuid)', :'egg_id'),
  'a part comes off a half-eaten plate'
);

select is(
  (select array[kcal::numeric, plate_quantity]
   from public.food_log_details where id = :'half_id'::uuid),
  array[200, 0.5]::numeric[],
  'and what is left is still half eaten'
);

select lives_ok(
  format('select public.remove_ingredient(%L::uuid)', :'rice_id'),
  'the last part comes off'
);

-- The entry counts as one dish again, its own 580 kcal, at the half the plate
-- was. Folded rather than dropped, or emptying a half-eaten plate would double
-- it.
select is(
  (select array[e.quantity, e.plate_quantity] from public.food_logs e
   where e.id = :'half_id'::uuid),
  array[0.5, 1]::numeric[],
  'emptying a plate folds its portion into the entry''s own'
);

select is(
  (select kcal from public.food_log_details where id = :'half_id'::uuid),
  290,
  'so an emptied half-eaten plate still counts half'
);

-- A new plate starts whole. The tea above carries a portion nothing has read,
-- and from its first part on, something would.
select lives_ok(
  format('select public.add_ingredient(%L::uuid, %L, 40, 8, 1, 1)', :'tea_id', 'Kuih'),
  'a food goes onto an entry holding a stale plate portion'
);

select is(
  (select array[kcal::numeric, plate_quantity]
   from public.food_log_details where id = :'tea_id'::uuid),
  array[160, 1]::numeric[],
  'and the plate it starts is whole'
);

reset role;

-- Folding the portion into the plate, which `scan-refine` does before a
-- correction edits the parts: the total stays where it was, and the parts are
-- what carry the half from then on.
insert into public.food_logs
  (user_id, log_date, quantity, source, item_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, plate_quantity)
values
  (:'user_a', current_date, 1, 'camera', 'Satay',
   400, 20.0, 30.0, 20.0, '1 serving', 1, 0.5);

select e.id as fold_id from public.food_logs e
where e.user_id = :'user_a' and e.item_name = 'Satay' \gset

-- Six sticks at 40 and a bowl of sauce at 160: a 400 kcal plate, half eaten.
insert into public.food_log_ingredients
  (food_log_id, quantity, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, position)
values
  (:'fold_id', 6, 'Chicken satay', 40, 1.0, 4.0, 2.0, '1 stick', 1, 0),
  (:'fold_id', 1, 'Peanut sauce', 160, 8.0, 6.0, 12.0, '1 bowl', 1, 1);

select is(
  (select kcal from public.food_log_details where id = :'fold_id'::uuid),
  200,
  'a half-eaten plate of satay counts half'
);

select lives_ok(
  format('select public.fold_plate_quantity(%L::uuid)', :'fold_id'),
  'the portion folds into the plate'
);

select is(
  (select array_agg(quantity order by position)
   from public.food_log_ingredients where food_log_id = :'fold_id'::uuid),
  array[3, 0.5]::numeric[],
  'every part carries the half now'
);

select is(
  (select array[kcal::numeric, plate_quantity]
   from public.food_log_details where id = :'fold_id'::uuid),
  array[200, 1]::numeric[],
  'and the total has not moved'
);

select is(
  (select quantity from public.food_logs where id = :'fold_id'::uuid),
  0.50,
  'the entry''s own portion takes the half as well'
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
