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

select plan(15);

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

-- -- WHAT WAS PAID FOR STAYS PAID FOR --------------------------------------
--
-- The most expensive thing this sweep could get wrong. Entitlement is read per
-- row at sweep time, so a lapsed subscription would otherwise hand it every
-- photograph the account ever took, on the night it lapsed — and the ugliest
-- version is the one where the user did nothing at all, because a renewal
-- webhook lost past RevenueCat's retries leaves a paying account reading as
-- expired. Only what was logged AFTER the last paid period ended is ever in
-- scope.
--
-- THIS ACCOUNT IS DELIBERATELY WELL OUTSIDE THE GRACE WINDOW, so that what is
-- asserted below is the paid-era rule ALONE. It used to lapse exactly sixty
-- days ago, which stopped meaning "long ago" the moment a sixty day grace
-- period existed: the account fell on the boundary, every photograph was
-- spared, and these two cases failed for a reason that had nothing to do with
-- what they are about. Written off the two functions rather than as intervals
-- so that neither number can drift out from under it again.

\set lapsed '88888888-8888-8888-8888-888888888888'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (:'lapsed', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lapsed@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'lapsed', 'expired', 'yearly',
        now() - make_interval(days => public.lapsed_photo_grace_days() + 60));

insert into public.food_logs
  (user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, photo_path, source, logged_at)
values
  -- Logged while they were paying. Kept, for ever.
  (:'lapsed', 'Paid-for plate', 500, 60, 20, 18, '1 plate', 1,
   'meals/88888888-8888-8888-8888-888888888888/paid.jpg', 'camera',
   now() - make_interval(days => public.lapsed_photo_grace_days() + 90)),
  -- Logged after the subscription ended, and now older than the free window.
  (:'lapsed', 'Since it lapsed', 500, 60, 20, 18, '1 plate', 1,
   'meals/88888888-8888-8888-8888-888888888888/after.jpg', 'camera',
   now() - make_interval(days => public.free_photo_retention_days() + 10));

select is(
  (select count(*)::integer from public.expired_meal_photos()),
  1,
  'a lapsed account loses only what it logged after the period it paid for'
);

select is(
  (select photo_path from public.expired_meal_photos()),
  'meals/88888888-8888-8888-8888-888888888888/after.jpg',
  'and the plate from the paid year is not the one being swept'
);

-- -- THE LAPSED SUBSCRIBER'S GRACE PERIOD -----------------------------------
--
-- A former subscriber is not swept the day they lapse. Three things have to be
-- true at once before one of their photographs goes, and the whole point of
-- these cases is that each is load-bearing on its own: old enough, logged after
-- the paid period ended, AND that period more than `lapsed_photo_grace_days()`
-- gone. The middle one is asserted above by the `pro` account; these cover the
-- third, which is the one a naive reading of "they are free now" would drop.

\set lapsed_recent '66666666-6666-6666-6666-666666666666'
\set lapsed_old    '77777777-7777-7777-7777-777777777777'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'lapsed_recent', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lapsed-recent@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'lapsed_old', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lapsed-old@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- One lapsed inside the grace window, one well outside it.
insert into public.subscriptions (user_id, status, plan, current_period_end)
values
  (:'lapsed_recent', 'expired', 'yearly',
   now() - make_interval(days => public.lapsed_photo_grace_days() - 10)),
  (:'lapsed_old', 'expired', 'yearly',
   now() - make_interval(days => public.lapsed_photo_grace_days() + 10));

select ok(
  not public.is_entitled(:'lapsed_recent') and not public.is_entitled(:'lapsed_old'),
  'both lapsed accounts read as unentitled, so only the grace period protects them'
);

-- Logged after each period ended, and old enough to be swept on the thirty day
-- rule alone. Only the account whose grace has run out should be picked.
insert into public.food_logs
  (user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, photo_path, source, logged_at)
values
  (:'lapsed_recent', 'Plate inside the grace window', 500, 60, 20, 18, '1 plate', 1,
   'meals/66666666-6666-6666-6666-666666666666/inside.jpg', 'camera',
   now() - make_interval(days => public.free_photo_retention_days() + 1)),
  (:'lapsed_old', 'Plate past the grace window', 500, 60, 20, 18, '1 plate', 1,
   'meals/77777777-7777-7777-7777-777777777777/past.jpg', 'camera',
   now() - make_interval(days => public.free_photo_retention_days() + 1));

select is(
  (select count(*)::integer from public.expired_meal_photos()
    where photo_path like 'meals/66666666%'),
  0,
  'a photograph is spared while the subscription is still inside its grace period'
);

select is(
  (select count(*)::integer from public.expired_meal_photos()
    where photo_path like 'meals/77777777%'),
  1,
  'and is swept once the grace period has run out'
);

-- The guard the grace period must not weaken: a plate from the PAID era stays
-- for good, however long ago the subscription ended.
insert into public.food_logs
  (user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, photo_path, source, logged_at)
values
  (:'lapsed_old', 'Plate from the paid era', 500, 60, 20, 18, '1 plate', 1,
   'meals/77777777-7777-7777-7777-777777777777/paid-era.jpg', 'camera',
   now() - make_interval(days => public.lapsed_photo_grace_days() + 30));

select is(
  (select count(*)::integer from public.expired_meal_photos()
    where photo_path like '%paid-era.jpg'),
  0,
  'a plate logged while they were paying is never swept, grace period or not'
);

select * from finish();

rollback;
