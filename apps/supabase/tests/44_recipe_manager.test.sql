-- ---------------------------------------------------------------------------
-- The Recipes tab's columns: times, meal tags, the source link and the star.
--
-- What matters is that each column is writable by its owner through the
-- client's grant, refuses what the app would never send, and that the source
-- link stays with its owner: the view nulls it for anybody else, the shared
-- link does too, and a saved copy does not carry it. Run as `authenticated`
-- with a forged claim, for the reason 02_rls gives.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

\set cook   'c0c0c0c0-0000-4000-8000-000000000001'
\set reader 'c0c0c0c0-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'cook',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rm-cook@example.test',   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'reader', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rm-reader@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- Both Pro, so the free tier's three-recipe ceiling is not what a refusal here
-- is about.
insert into public.subscriptions (user_id, status, plan, current_period_end)
values
  (:'cook',   'active', 'yearly', now() + interval '1 year'),
  (:'reader', 'active', 'yearly', now() + interval '1 year');


-- THE OWNER WRITES THEM ------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'cook', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  format($$insert into public.recipes
             (owner_id, name, servings, prep_minutes, cook_minutes, tags, source_url, is_favourite)
           values (%L, 'rm-fixture-kari', 6, 20, 50, '{lunch,dinner}',
                   'https://www.instagram.com/reel/abc', true)$$, :'cook'),
  'the client grant covers times, tags, the source link and the star'
);

select id as recipe_id, share_slug as slug
  from public.recipes where name = 'rm-fixture-kari' \gset

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags, source_url, is_favourite, total_minutes
             from public.recipe_details where id = %L$$, :'recipe_id'),
  $$values (20, 50, '{lunch,dinner}'::text[], 'https://www.instagram.com/reel/abc'::text, true, 70)$$,
  'the owner reads every new column back through the view, and prep plus cook'
);

select lives_ok(
  format($$update public.recipes set is_favourite = false, cook_minutes = 45 where id = %L$$, :'recipe_id'),
  'the owner can take the star off and change a time'
);

select throws_ok(
  format($$update public.recipes set tags = '{brunch}' where id = %L$$, :'recipe_id'),
  '23514', null,
  'a meal tag outside the fixed set is refused'
);

select throws_ok(
  format($$update public.recipes set prep_minutes = 3000 where id = %L$$, :'recipe_id'),
  '23514', null,
  'a prep time over two days is refused'
);

select throws_ok(
  format($$update public.recipes set source_url = 'javascript:alert(1)' where id = %L$$, :'recipe_id'),
  '23514', null,
  'a source link that is not http(s) is refused'
);

select throws_ok(
  format($$update public.recipes set source_url = 'https://a.b/has space' where id = %L$$, :'recipe_id'),
  '23514', null,
  'a source link with whitespace in it is refused'
);

-- Publish it, then approve as the reviewer would, so the reader can see it.
select public.set_recipe_public(:'recipe_id'::uuid, true);
reset role;
update public.recipes set review_status = 'approved' where id = :'recipe_id';


-- ANYBODY ELSE ---------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags from public.recipe_details where id = %L$$, :'recipe_id'),
  $$values (20, 45, '{lunch,dinner}'::text[])$$,
  'a community reader sees the times and the meals'
);

select is(
  (select source_url from public.recipe_details where id = :'recipe_id'),
  null,
  'the source link is nulled for anybody but its owner'
);

-- Starred again as the cook, below, so this proves the reader's view hides it.
reset role;
update public.recipes set is_favourite = true where id = :'recipe_id';
set local role authenticated;

select is(
  (select is_favourite from public.recipe_details where id = :'recipe_id'),
  false,
  'and so is the cook''s star, which would otherwise draw on the reader''s card'
);

select is(
  (select total_minutes from public.recipe_details where id = :'recipe_id'),
  65,
  'the reader gets the total time, for the quick filter'
);

select is(
  (select source_url from public.get_shared_recipe(:'slug')),
  null,
  'a shared link nulls the source link too'
);

select is(
  (select prep_minutes::int from public.get_shared_recipe(:'slug')),
  20,
  'a shared link carries the times'
);

select is(
  (select is_favourite from public.get_shared_recipe(:'slug')),
  false,
  'and not the cook''s star'
);

select lives_ok(
  format($$update public.recipes set cook_minutes = 1 where id = %L$$, :'recipe_id'),
  'writing somebody else''s recipe is not an error'
);
reset role;
select is(
  (select cook_minutes::int from public.recipes where id = :'recipe_id'),
  45,
  'but it changes nothing: the update policy is own-only'
);

set local role authenticated;
select public.save_recipe_copy(:'recipe_id'::uuid) as copy_id \gset
reset role;

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags, source_url, is_favourite
             from public.recipes where id = %L$$, :'copy_id'),
  $$values (20, 45, '{lunch,dinner}'::text[], null::text, false)$$,
  'a saved copy keeps the times and meals, and not the link or the star'
);

select * from finish();
rollback;
