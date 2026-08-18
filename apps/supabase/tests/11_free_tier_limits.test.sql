-- ---------------------------------------------------------------------------
-- The two free-tier ceilings that are not about scanning: how many recipes a
-- free account may keep, and how long its photographs are kept for.
--
-- Both are enforced HERE rather than in the app, and for the same reason the
-- publishing gate is: `recipes` is written by the client directly, under RLS,
-- with no function in between, so a limit that lived in the app would be a
-- limit that applied to people running the app. The retention sweep is the
-- other way round — no client is involved at all — and what is asserted about
-- it is that it picks the right rows: old enough, still carrying a picture, and
-- belonging to somebody who is not paying.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\set free '44444444-4444-4444-4444-444444444444'
\set pro  '55555555-5555-5555-5555-555555555555'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'free', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'free@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'pro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pro@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'pro', 'active', 'yearly', now() + interval '30 days');

-- -- THE RECIPE CEILING ------------------------------------------------------
-- Filled to the edge and pushed one past it, like the scan meter. The limit is
-- read from `free_recipe_limit()` rather than written as 3, so a change to the
-- number is not a failing test.

insert into public.recipes (owner_id, name, servings, steps)
select :'free', 'free-pot-' || n, 2, 'Cook it.'
  from generate_series(1, public.free_recipe_limit()) as n;

select is(
  (select count(*)::integer from public.recipes where owner_id = :'free'),
  public.free_recipe_limit(),
  'a free account fills up to its ceiling'
);

select throws_ok(
  $$insert into public.recipes (owner_id, name, servings, steps)
    values ('44444444-4444-4444-4444-444444444444', 'one too many', 2, 'Cook it.')$$,
  'P0001',
  'recipe_limit_reached',
  'and the one after it is refused, in the database rather than in the app'
);

-- Saving somebody else's recipe writes a row owned by the saver, so it goes
-- through the same trigger. Exempting copies would make "save a community
-- recipe" the way past the ceiling.
select throws_ok(
  $$insert into public.recipes (owner_id, name, servings, steps, source_recipe_id)
    values ('44444444-4444-4444-4444-444444444444', 'a saved copy', 2, 'Cook it.',
            (select id from public.recipes where owner_id = '44444444-4444-4444-4444-444444444444' limit 1))$$,
  'P0001',
  'recipe_limit_reached',
  'and a saved copy counts, or saving would be the way round it'
);

insert into public.recipes (owner_id, name, servings, steps)
select :'pro', 'pro-pot-' || n, 2, 'Cook it.'
  from generate_series(1, public.free_recipe_limit() + 2) as n;

select is(
  (select count(*)::integer from public.recipes where owner_id = :'pro'),
  public.free_recipe_limit() + 2,
  'and a subscribed account walks straight past the same ceiling'
);

-- -- THE PHOTOGRAPH WINDOW ---------------------------------------------------

insert into public.food_logs
  (user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, photo_path, source, logged_at)
values
  (:'free', 'Old plate', 500, 60, 20, 18, '1 plate', 1,
   'meals/44444444-4444-4444-4444-444444444444/old.jpg', 'camera',
   now() - make_interval(days => public.free_photo_retention_days() + 1)),
  (:'free', 'Fresh plate', 500, 60, 20, 18, '1 plate', 1,
   'meals/44444444-4444-4444-4444-444444444444/fresh.jpg', 'camera', now()),
  (:'pro', 'Old plate, paid for', 500, 60, 20, 18, '1 plate', 1,
   'meals/55555555-5555-5555-5555-555555555555/old.jpg', 'camera',
   now() - make_interval(days => public.free_photo_retention_days() + 1));

select is(
  (select count(*)::integer from public.expired_meal_photos()),
  1,
  'only the free account''s aged photograph is swept'
);

select is(
  (select photo_path from public.expired_meal_photos()),
  'meals/44444444-4444-4444-4444-444444444444/old.jpg',
  'and it is the old one, not the one logged today'
);

-- What the sweep writes back, once R2 has answered. The entry survives: only
-- the picture goes, and a drawing takes its place so the row is not a grey
-- square in a diary of photographs.
select is(
  public.clear_meal_photos(
    (select jsonb_agg(jsonb_build_object('id', id, 'icon_set', 'food', 'icon_name', 'rice-bowl'))
       from public.expired_meal_photos())
  ),
  1,
  'clearing it reports the one row it changed'
);

select is(
  (select count(*)::integer from public.expired_meal_photos()),
  0,
  'and the same sweep run again finds nothing'
);

select is(
  (select icon_name from public.food_logs
    where user_id = :'free' and item_name = 'Old plate'),
  'rice-bowl',
  'the entry keeps its place in the diary, with a drawing where the plate was'
);

select * from finish();

rollback;
