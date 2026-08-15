-- ---------------------------------------------------------------------------
-- Recipes: what a pot costs, and who can see whose cooking.
--
-- Two things are being checked here and they fail in opposite ways. The
-- arithmetic fails LOUDLY — a recipe priced wrong logs the wrong calories, and
-- the assertions on it are ordinary sums. Visibility fails QUIETLY,
-- by returning more rows than it should, which is why the second half runs as
-- `authenticated` with a forged JWT claim exactly as 02_rls does. Run as
-- `postgres` every one of those assertions passes while proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

\set cook  '33333333-3333-3333-3333-333333333333'
\set other '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'cook',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cook@example.test',  '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'other', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());


-- THE MIRROR -----------------------------------------------------------------

-- Fixture names, not plausible ones, and every lookup below is by NAME. A
-- database that has been used has recipes in it — the official seed alone has a
-- rendang — and `\gset` fails outright on a second row, which is a test that
-- breaks on a developer's machine and passes in CI. Same discipline as
-- 00_catalogue's assertions about how big the catalogue actually is.
insert into public.recipes (owner_id, name, servings, steps, photo_path)
values (:'cook', 'fixture-pot-a', 6, 'Fry the rempah until it darkens.',
        'meals/33333333-3333-3333-3333-333333333333/fixture.jpg');

select id as recipe_id from public.recipes where name = 'fixture-pot-a' \gset
-- THE MIRROR IS GONE, and four assertions went with it: that a new recipe
-- minted a `foods` row, that the row had exactly one base portion at factor 1,
-- that a pot feeding several offered half/one/two/whole, and that a pot feeding
-- two did not also offer itself whole. All four were about a catalogue row this
-- database no longer has — see the header of `schemas/22_recipes.sql`. What
-- they protected is now unspellable rather than asserted: there is no second
-- copy of a recipe's figures to drift from the first.

-- 1 kg of beef at 1.64 kcal/g, 400 ml of santan at 1.95 kcal/ml: 2,420 kcal in
-- the pot, 403 in a serving of six.
insert into public.recipe_ingredients (recipe_id, name, amount, unit, kcal_per_unit, protein_g_per_unit, position)
values (:'recipe_id', 'Beef shin', 1000, 'g', 1.64, 0.22, 0);

insert into public.recipe_ingredients (recipe_id, name, amount, unit, kcal_per_unit, fat_g_per_unit, position)
values (:'recipe_id', 'Coconut milk, thick', 400, 'ml', 1.95, 0.21, 1);

select is(
  (select total_kcal from public.recipe_details where id = :'recipe_id'),
  2420,
  'the pot costs what went into it'
);

select is(
  (select serving_kcal from public.recipe_details where id = :'recipe_id'),
  403,
  'and a serving is that divided by how many it feeds'
);

-- Realising it was four servings and not six reprices the pot. It no longer
-- moves PAST logs of it, and that is the trade the mirror's removal made: an
-- entry took its copy when it was written. `food_logs.recipe_id` is what a
-- re-snapshot job would join on.
update public.recipes set servings = 4 where id = :'recipe_id';

select is(
  (select serving_kcal from public.recipe_details where id = :'recipe_id'),
  605,
  'changing how many it feeds reprices a serving'
);

-- Logging a pot is an ordinary entry carrying the recipe's per-serving figures,
-- which is exactly what `snapshotFromRecipe` builds on the client.
insert into public.food_logs
  (user_id, log_date, recipe_id, item_name, base_kcal, base_carbs_g,
   base_protein_g, base_fat_g, serving_label, serving_factor)
select :'cook', current_date, r.id, r.name,
       r.serving_kcal, r.serving_carbs_g, r.serving_protein_g, r.serving_fat_g,
       '1 serving', 1
from public.recipe_details r where r.id = :'recipe_id';

select is(
  (select kcal from public.food_log_details
   where user_id = :'cook' and recipe_id = :'recipe_id'),
  605,
  'and a logged serving of it costs what the recipe said at the time'
);


-- WHO SEES WHOSE COOKING -----------------------------------------------------

-- The RiceCal kitchen. No owner, which is the only thing that makes a recipe
-- official — written here as the table owner, because no client can.
insert into public.recipes (owner_id, name, servings)
values (null, 'fixture-kitchen-a', 1);

select set_config('request.jwt.claims',
  json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.recipes where name = 'fixture-pot-a'),
  0,
  'a private recipe is invisible to everybody else'
);

select is(
  (select count(*)::integer from public.recipes where name = 'fixture-kitchen-a'),
  1,
  'the RiceCal kitchen is visible to everybody'
);

select is(
  (select is_official from public.recipe_details where name = 'fixture-kitchen-a'),
  true,
  'and reads as official, because it has no owner'
);

reset role;

-- Public but not yet reviewed. This is the assertion the whole moderation gate
-- rests on: asking to publish is not publishing.
update public.recipes set is_public = true, review_status = 'pending'
where id = :'recipe_id';

select set_config('request.jwt.claims',
  json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.recipes where name = 'fixture-pot-a'),
  0,
  'a recipe awaiting review is not in the community yet'
);

-- The other half of that gate: a client that simply approved itself would make
-- the review a formality the app performs on itself. `review_status` is not in
-- the column grant, so this is a privilege error rather than a policy one.
select throws_ok(
  $q$update public.recipes set review_status = 'approved'$q$,
  '42501',
  null,
  'and no client can approve one itself'
);

-- The SAME gate on the way IN. A table-wide insert grant let a client create
-- the row already approved and public, skipping the reviewer entirely — the
-- before-insert trigger does not touch these columns. `review_status` and
-- `is_public` are out of the INSERT grant too, so naming either is a privilege
-- error before RLS is even consulted.
select throws_ok(
  $q$insert into public.recipes (owner_id, name, servings, review_status)
     values ((select auth.uid()), 'fixture-insert-approved', 1, 'approved')$q$,
  '42501',
  null,
  'and no client can insert one pre-approved'
);

select throws_ok(
  $q$insert into public.recipes (owner_id, name, servings, is_public)
     values ((select auth.uid()), 'fixture-insert-public', 1, true)$q$,
  '42501',
  null,
  'and no client can insert one already public'
);

reset role;

update public.recipes set review_status = 'approved' where id = :'recipe_id';

select set_config('request.jwt.claims',
  json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.recipes where name = 'fixture-pot-a'),
  1,
  'an approved public recipe reaches the community'
);

select is(
  (select count(*)::integer from public.recipe_ingredient_details
   where recipe_id = :'recipe_id'),
  2,
  'with its ingredients, because visibility follows the recipe'
);

-- THE GATE'S SECOND HALF. Publishing bland text and then rewriting it is the
-- way round a reviewer that only ever reads a recipe once.
reset role;

update public.recipes set steps = 'Buy my rendang at example.com' where id = :'recipe_id';

select is(
  (select review_status::text from public.recipes where id = :'recipe_id'),
  'pending',
  'editing a published recipe sends it back to the reviewer'
);

select is(
  (select is_public from public.recipes where id = :'recipe_id'),
  true,
  'and leaves it public, so the author does not have to ask twice'
);

-- The nutrition is reviewable too — "calories that do not follow from the
-- ingredients" is one of the two grounds — so swapping the list has to count.
update public.recipes set review_status = 'approved' where id = :'recipe_id';

update public.recipe_ingredients set amount = 5000
where recipe_id = :'recipe_id' and name = 'Beef shin';

select is(
  (select review_status::text from public.recipes where id = :'recipe_id'),
  'pending',
  'and so does rewriting what is in it'
);

-- A private recipe has nothing to re-review: nobody but its author can see it,
-- and marking it pending would let an edit stand in for a reading on the next
-- publish.
select id as private_id from public.recipes where name = 'fixture-kitchen-a' \gset

-- Approved FIRST, so the assertion has something to preserve: `pending` is the
-- default, and asserting it on a row that never left it proves nothing.
update public.recipes set review_status = 'approved' where id = :'private_id';
update public.recipes set servings = 3 where id = :'private_id';

select is(
  (select review_status::text from public.recipes where id = :'private_id'),
  'approved',
  'a recipe nobody can see is left where it was'
);

-- Put it back where the assertions below expect it.
update public.recipe_ingredients set amount = 1000
where recipe_id = :'recipe_id' and name = 'Beef shin';
update public.recipes set review_status = 'approved' where id = :'recipe_id';

select set_config('request.jwt.claims',
  json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Saving somebody else's is a COPY. Changing it must not touch theirs.
select public.save_recipe_copy(:'recipe_id') as copy_id \gset

select is(
  (select count(*)::integer from public.recipe_ingredients where recipe_id = :'copy_id'),
  2,
  'saving a copy brings the ingredients with it'
);

select is(
  (select source_recipe_id from public.recipes where id = :'copy_id'),
  :'recipe_id'::uuid,
  'and records where it came from'
);

-- But NOT the photograph. A key names one object under one user's prefix, so a
-- copied key could never be signed for its new owner — and deleting the
-- original would take the object out from under every copy of it.
select is(
  (select photo_path from public.recipes where id = :'copy_id'),
  null,
  'a copy does not inherit the original author''s photograph'
);

select is(
  (select saved_count from public.recipes where id = :'recipe_id'),
  1,
  'and counts as a save for the original'
);

-- ONE SAVE PER PERSON, however many copies they take.
--
-- The community shelf is ORDERED by `saved_count`, so a counter that bumped on
-- every call was a way to the top of it: save your own favourite twenty times.
-- The ledger's primary key is what decides this, and the assertion is that the
-- second copy still gets made — it is a legitimate thing to do, it just is not
-- a second vote.
select public.save_recipe_copy(:'recipe_id') as second_copy \gset

select isnt(
  :'second_copy'::uuid,
  :'copy_id'::uuid,
  'saving the same recipe twice still makes a second copy'
);

select is(
  (select saved_count from public.recipes where id = :'recipe_id'),
  1,
  'but the same person saving twice counts once'
);

-- The copy is the saver's own from the first moment, mirror and all.
select is(
  (select serving_kcal from public.recipe_details where id = :'copy_id'),
  605,
  'the copy prices itself the same way the original does'
);

reset role;

-- Read as the owner, because `authenticated` cannot see this table at all —
-- which is the assertion two below.
select is(
  (select count(*)::integer from public.recipe_saves where recipe_id = :'recipe_id'),
  1,
  'and the ledger holds one row for them'
);

-- No client writes the ledger, which is the other half of counting people
-- rather than saves: an insert grant here is a vote button.
select ok(
  not has_table_privilege('authenticated', 'public.recipe_saves', 'INSERT'),
  'authenticated cannot write the saves ledger'
);
select ok(
  not has_table_privilege('authenticated', 'public.recipe_saves', 'SELECT'),
  'nor read it; the count on the recipe is what a client sees'
);

select is(
  (select count(*)::integer from public.recipes where id = :'copy_id' and owner_id = :'other'),
  1,
  'a saved copy belongs to whoever saved it'
);

select * from finish();

rollback;
