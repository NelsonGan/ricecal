-- ---------------------------------------------------------------------------
-- Recipes imported from a video: the cache, the monthly allowance, the one
-- community recipe per video, and the credit.
--
-- What matters: a client can neither read the cache nor write a credit or an
-- import id of its own; `import_recipe_for` (server only) makes exactly one
-- recipe per person per video, claims the month's allowance with it and
-- refuses past five on a free account; the first importer's recipe is the
-- community one and everybody after saves it; imported recipes sit outside the
-- three kept on a free account. Client checks run as `authenticated` with a
-- forged claim, for the reason 02_rls gives.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

\set first  'd1d1d1d1-0000-4000-8000-000000000001'
\set second 'd1d1d1d1-0000-4000-8000-000000000002'
\set third  'd1d1d1d1-0000-4000-8000-000000000003'
\set fourth 'd1d1d1d1-0000-4000-8000-000000000004'
\set video  'd1d1d1d1-0000-4000-8000-0000000000aa'
\set dance  'd1d1d1d1-0000-4000-8000-0000000000bb'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'first',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ri-first@example.test',  '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'second', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ri-second@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'third',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ri-third@example.test',  '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'fourth', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ri-fourth@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- All three free: no subscription row.

insert into public.recipe_imports (id, platform, video_id, canonical_url, status, draft, author_handle, analysed_from, created_by)
values (
  :'video', 'tiktok', '9000000000000000001',
  'https://www.tiktok.com/@cook/video/9000000000000000001', 'recipe',
  jsonb_build_object(
    'name', 'ri-fixture-pasta', 'servings', 4, 'steps', 'Boil it.\nEat it.',
    'prep_minutes', 10, 'cook_minutes', 30, 'tags', jsonb_build_array('dinner'),
    'icon_set', null, 'icon_name', null,
    'ingredients', jsonb_build_array(
      jsonb_build_object('name', 'Rigatoni', 'amount', 400, 'unit', 'g', 'kcal_per_unit', 3.5,
                         'carbs_g_per_unit', 0.7, 'protein_g_per_unit', 0.13, 'fat_g_per_unit', 0.015, 'position', 0),
      jsonb_build_object('name', 'Egg', 'amount', 2, 'unit', 'piece', 'kcal_per_unit', 72,
                         'carbs_g_per_unit', 0.4, 'protein_g_per_unit', 6, 'fat_g_per_unit', 5, 'position', 1)
    )
  ),
  '@cook', 'video', :'first'
), (
  :'dance', 'instagram', 'DanceClip1', 'https://www.instagram.com/reel/DanceClip1/', 'not_recipe',
  null, '@dancer', 'caption', :'first'
);


-- THE CLIENT ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'first', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select * from public.recipe_imports$$,
  '42501', null,
  'a client cannot read the import cache'
);

select throws_ok(
  format($$insert into public.recipes (owner_id, name, import_platform, import_author, import_url)
           values (%L, 'ri-forged', 'instagram', '@somebody', 'https://www.instagram.com/reel/X/')$$, :'first'),
  '42501', null,
  'a client cannot write a video credit onto its own recipe'
);

select throws_ok(
  format($$select * from public.import_recipe_for(%L, %L)$$, :'first', :'video'),
  '42501', null,
  'a client cannot make an imported recipe itself'
);

select results_eq(
  $$select used, monthly_limit, remaining, entitled from public.recipe_import_usage_this_month()$$,
  $$values (0, 5, 5, false)$$,
  'a free account starts the month with five imports'
);

reset role;


-- THE FIRST IMPORT ------------------------------------------------------------

set local role service_role;

select results_eq(
  format($$select existing, allowed, used, monthly_limit, is_community, community_review::text
             from public.import_recipe_for(%L, %L)$$, :'first', :'video'),
  $$values (false, true, 1, 5, true, 'pending')$$,
  'the first import makes a recipe, takes one import and becomes the community recipe'
);

select id as first_recipe from public.recipes
 where owner_id = :'first' and import_id = :'video' \gset

select results_eq(
  format($$select is_public, review_status::text, import_platform, import_author, import_url,
                  servings::int, prep_minutes::int, tags, ingredient_count, total_kcal
             from public.recipe_details where id = %L$$, :'first_recipe'),
  $$values (true, 'pending', 'tiktok', '@cook', 'https://www.tiktok.com/@cook/video/9000000000000000001',
            4, 10, '{dinner}'::text[], 2, 1544)$$,
  'it is written from the cached draft, credited, and pending review'
);

select results_eq(
  format($$select existing, used from public.import_recipe_for(%L, %L)$$, :'first', :'video'),
  $$values (true, 1)$$,
  'importing the same video again hands back the same recipe and takes nothing'
);

select is(
  (select count(*)::int from public.recipes where owner_id = :'first' and import_id = :'video'),
  1,
  'and makes no second recipe'
);

select throws_ok(
  format($$select * from public.import_recipe_for(%L, %L)$$, :'first', :'dance'),
  'P0001', 'import not found',
  'a video cached as not a recipe makes nothing'
);

select throws_ok(
  format($$select * from public.import_recipe_for(%L, %L, 'meals/%s/x.jpg')$$, :'first', :'video', :'second'),
  'P0001', 'photo is not this user''s',
  'a cover under somebody else''s prefix is refused'
);

update public.recipes set review_status = 'approved' where id = :'first_recipe';


-- THE SECOND IMPORTER SAVES IT -----------------------------------------------

select results_eq(
  format($$select is_community, community_recipe_id from public.import_recipe_for(%L, %L)$$, :'second', :'video'),
  format($$values (false, %L::uuid)$$, :'first_recipe'),
  'a later importer gets a recipe of their own, not the community one'
);

select results_eq(
  format($$select is_public, source_recipe_id, import_author from public.recipes
             where owner_id = %L and import_id = %L$$, :'second', :'video'),
  format($$values (false, %L::uuid, '@cook'::text)$$, :'first_recipe'),
  'private, pointing at the community recipe, with the same credit'
);

select is(
  (select saved_count from public.recipes where id = :'first_recipe'),
  1,
  'and counts as one save of it'
);

reset role;


-- READERS SEE THE CREDIT, AND COPIES KEEP IT ---------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'third', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  format($$select import_platform, import_author, source_url from public.recipe_details where id = %L$$, :'first_recipe'),
  $$values ('tiktok'::text, '@cook'::text, null::text)$$,
  'a reader of the community recipe sees the credit and not the owner''s bookmark'
);

select lives_ok(
  format($$select public.save_recipe_copy(%L)$$, :'first_recipe'),
  'a reader can save a copy of it'
);

select results_eq(
  format($$select import_author, import_id from public.recipes
             where owner_id = %L and source_recipe_id = %L$$, :'third', :'first_recipe'),
  $$values ('@cook'::text, null::uuid)$$,
  'the copy keeps the credit but is a recipe kept, not a video imported'
);

reset role;


-- THE FREE CEILINGS ------------------------------------------------------------

-- The first account keeps three hand-written recipes beside its import.
select set_config('request.jwt.claims',
  json_build_object('sub', :'first', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format($$insert into public.recipes (owner_id, name) values (%L, 'ri-a'), (%L, 'ri-b'), (%L, 'ri-c')$$,
         :'first', :'first', :'first'),
  'an imported recipe does not count against the three a free account keeps'
);

select throws_ok(
  format($$insert into public.recipes (owner_id, name) values (%L, 'ri-d')$$, :'first'),
  'P0001', 'recipe_limit_reached',
  'the fourth hand-written one is still refused'
);

reset role;
set local role service_role;

-- Four more imports used this month: five in all.
update public.recipe_import_usage set imports = 5 where user_id = :'first';

insert into public.recipe_imports (id, platform, video_id, canonical_url, status, draft, analysed_from)
select gen_random_uuid(), 'youtube', 'ri-video-2', 'https://www.youtube.com/watch?v=ri-video-2', 'recipe', draft, 'video'
  from public.recipe_imports where id = :'video';

select id as video_two from public.recipe_imports where video_id = 'ri-video-2' \gset

select results_eq(
  format($$select allowed, recipe_id, used, monthly_limit from public.import_recipe_for(%L, %L)$$, :'first', :'video_two'),
  $$values (false, null::uuid, 5, 5)$$,
  'the sixth import of the month on a free account is refused'
);

select is(
  (select count(*)::int from public.recipes where owner_id = :'first' and import_id = :'video_two'),
  0,
  'and makes nothing'
);

select results_eq(
  format($$select used, remaining from public.recipe_import_allowance(%L)$$, :'first'),
  $$values (5, 0)$$,
  'the allowance says none are left'
);


-- AN UNPUBLISHED ORIGINAL HANDS THE SHELF ON ---------------------------------

update public.recipes set is_public = false where id = :'first_recipe';

select results_eq(
  format($$select is_community from public.import_recipe_for(%L, %L)$$, :'third', :'video'),
  $$values (true)$$,
  'once the community recipe is unpublished, the next importer''s takes its place'
);

select is(
  (select community_recipe_id from public.recipe_imports where id = :'video'),
  (select id from public.recipes where owner_id = :'third' and import_id = :'video'),
  'and the cache points at it'
);


-- A REJECTED ONE DOES TOO ----------------------------------------------------

-- Its owner turned it into something the reviewer refused. The video is still
-- a recipe, so the next importer's goes up for review in its place.
update public.recipes set review_status = 'rejected'
 where owner_id = :'third' and import_id = :'video';

select results_eq(
  format($$select is_community, community_review::text from public.import_recipe_for(%L, %L)$$, :'fourth', :'video'),
  $$values (true, 'pending')$$,
  'once the community recipe is rejected, the next importer''s takes its place'
);

select is(
  (select source_recipe_id from public.recipes where owner_id = :'fourth' and import_id = :'video'),
  null::uuid,
  'without being counted as a save of the rejected one'
);


-- THE HOURLY CEILING ON MODEL RUNS --------------------------------------------

select is(
  (select count(*)::int from generate_series(1, 25) g
    where public.claim_recipe_import_run(:'second')),
  20,
  'twenty uncached model runs an hour, then no more'
);

select * from finish();
rollback;
