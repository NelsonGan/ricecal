-- ---------------------------------------------------------------------------
-- The Recipes tab's data: times and meal tags on `recipes`, and the cook's
-- source link and favourite star in the owner-only `recipe_private`.
--
-- What matters is that the owner can write all of it through the client's
-- grants, that the checks refuse what the app would never send, and that the
-- link and the star stay with their owner however they are asked for: the
-- table itself, the view, a shared link, and a saved copy. Run as
-- `authenticated` with a forged claim, for the reason 02_rls gives.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
  format($$insert into public.recipes (owner_id, name, servings, prep_minutes, cook_minutes, tags)
           values (%L, 'rm-fixture-kari', 6, 20, 50, '{lunch,dinner}')$$, :'cook'),
  'the client grant covers the times and the meal tags'
);

select id as recipe_id, share_slug as slug
  from public.recipes where name = 'rm-fixture-kari' \gset

select lives_ok(
  format($$insert into public.recipe_private (recipe_id, owner_id, source_url, is_favourite)
           values (%L, %L, 'https://www.instagram.com/reel/abc', true)$$, :'recipe_id', :'cook'),
  'the owner keeps a source link and a star for their own recipe'
);

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags, source_url, is_favourite
             from public.recipe_details where id = %L$$, :'recipe_id'),
  $$values (20, 50, '{lunch,dinner}'::text[], 'https://www.instagram.com/reel/abc'::text, true)$$,
  'the owner reads all of it back through the view'
);

select lives_ok(
  format($$update public.recipe_private set is_favourite = false where recipe_id = %L$$, :'recipe_id'),
  'the owner can take the star off'
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
  format($$update public.recipe_private set source_url = 'javascript:alert(1)' where recipe_id = %L$$, :'recipe_id'),
  '23514', null,
  'a source link that is not http(s) is refused'
);

select throws_ok(
  format($$update public.recipe_private set source_url = 'https://a.b/has space' where recipe_id = %L$$, :'recipe_id'),
  '23514', null,
  'a source link with whitespace in it is refused'
);

-- Starred again, so the reader's checks below prove it is hidden. Then publish
-- and approve as the reviewer would, so the reader can see the recipe.
update public.recipe_private set is_favourite = true where recipe_id = :'recipe_id';
select public.set_recipe_public(:'recipe_id'::uuid, true);
reset role;
update public.recipes set review_status = 'approved' where id = :'recipe_id';


-- ANYBODY ELSE ---------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags from public.recipe_details where id = %L$$, :'recipe_id'),
  $$values (20, 50, '{lunch,dinner}'::text[])$$,
  'a community reader sees the times and the meals'
);

select is(
  (select count(*)::int from public.recipe_private where recipe_id = :'recipe_id'),
  0,
  'the table itself gives a reader nothing of the cook''s link or star'
);

select results_eq(
  format($$select source_url, is_favourite from public.recipe_details where id = %L$$, :'recipe_id'),
  $$values (null::text, false)$$,
  'nor does the view'
);

select results_eq(
  format($$select source_url, is_favourite, prep_minutes::int from public.get_shared_recipe(%L)$$, :'slug'),
  $$values (null::text, false, 20)$$,
  'nor a shared link, which carries the times'
);

select throws_ok(
  format($$insert into public.recipe_private (recipe_id, owner_id, source_url)
           values (%L, %L, 'https://spam.example')$$, :'recipe_id', :'reader'),
  '42501', null,
  'a reader cannot attach a row to somebody else''s recipe'
);

select lives_ok(
  format($$update public.recipe_private set is_favourite = false where recipe_id = %L$$, :'recipe_id'),
  'changing somebody else''s star is not an error'
);

select lives_ok(
  format($$update public.recipes set cook_minutes = 1 where id = %L$$, :'recipe_id'),
  'nor is writing their recipe'
);
reset role;

select results_eq(
  format($$select r.cook_minutes::int, p.is_favourite
             from public.recipes r join public.recipe_private p on p.recipe_id = r.id
            where r.id = %L$$, :'recipe_id'),
  $$values (50, true)$$,
  'but neither changes anything: both policies are own-only'
);

set local role authenticated;
select public.save_recipe_copy(:'recipe_id'::uuid) as copy_id \gset
reset role;

select results_eq(
  format($$select prep_minutes::int, cook_minutes::int, tags from public.recipes where id = %L$$, :'copy_id'),
  $$values (20, 50, '{lunch,dinner}'::text[])$$,
  'a saved copy keeps the times and meals'
);

select is(
  (select count(*)::int from public.recipe_private where recipe_id = :'copy_id'),
  0,
  'and not the link or the star'
);

select * from finish();
rollback;
