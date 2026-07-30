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

select plan(15);

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


-- One estimate per dish, however it is spelt -----------------------------------

select is(
  public.upsert_estimate_food('Zzz Test Estimate Dish', 500, 60, 20, 18),
  public.upsert_estimate_food('  ZZZ test, estimate dish!  ', 700, 80, 30, 25),
  'estimates dedup on the normalized name — spelling and casing collapse to one row'
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


-- display_label changes the name, never the numbers ---------------------------

-- A scanned entry pointing at the terminal archetype, wearing the model's
-- specific name.
insert into public.food_logs (user_id, log_date, meal, food_id, serving_id, quantity, source, scan_id, display_label)
select :'user_a', current_date, 'lunch', f.id, s.id, 1, 'camera',
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
