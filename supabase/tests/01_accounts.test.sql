-- ---------------------------------------------------------------------------
-- Signup, onboarding, and the budget that follows from them.
--
-- These are the paths with no client-side equivalent left: the profile rows
-- appear because of a trigger, and the calorie target appears because of
-- another one. If either stops firing, nothing errors — the app just shows a
-- user with no settings, or a ring with no goal behind it.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Fixed ids so failures name the same user every run.
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'


-- 1. SIGNUP ------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  :'user_a', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'aisyah@example.test',
  '{}'::jsonb, '{"full_name": "Aisyah"}'::jsonb, now(), now()
);

select is(
  (select display_name from public.profiles where id = :'user_a'),
  'Aisyah',
  'signup creates a profile and takes the name from the identity provider'
);

select is(
  (select count(*)::integer from public.user_settings where user_id = :'user_a'),
  1,
  'signup creates a settings row'
);

select is(
  (select count(*)::integer from public.meal_times where user_id = :'user_a'),
  4,
  'signup seeds four meal times'
);

select is(
  (select bool_or(reminder_enabled) from public.meal_times where user_id = :'user_a'),
  false,
  'no reminder is switched on without being asked for'
);

-- A budget cannot be computed from a body nobody has described yet, and a
-- placeholder would render as a real goal on the Today ring.
select is(
  (select count(*)::integer from public.daily_goals where user_id = :'user_a'),
  0,
  'no calorie goal exists before onboarding'
);


-- 2. ONBOARDING --------------------------------------------------------------
--
-- Pinned to UTC so `local_today()` and `current_date` agree. In Kuala Lumpur
-- they disagree for the eight hours after midnight local, which is correct
-- behaviour and would make this suite fail depending on the hour it ran.

update public.profiles
set timezone       = 'UTC',
    sex            = 'female',
    birth_date     = current_date - interval '28 years',
    height_cm      = 163,
    activity_level = 'light',
    weight_goal    = 'lose',
    target_weight_kg = 58
where id = :'user_a';

select is(
  (select count(*)::integer from public.daily_goals where user_id = :'user_a'),
  0,
  'a described body with no recorded weight still yields no goal'
);

-- Onboarding's weight field is written as the first weigh-in, which is what
-- completes the inputs and fires the recompute.
insert into public.weight_logs (user_id, measured_on, weight_kg)
values (:'user_a', current_date, 68.0);

-- Mifflin-St Jeor: 10(68) + 6.25(163) - 5(28) - 161 = 1397.75
-- x 1.375 (light) = 1921.9, - 400 (lose) = 1521.9, to the nearest 10 = 1520.
select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1520,
  'the weigh-in completes the inputs and the budget is computed'
);

select is(
  (select array[carbs_g, protein_g, fat_g] from public.daily_goals where user_id = :'user_a'),
  array[179, 84, 52],
  'macros follow the 47/22/31 split of that budget'
);

select is(
  (select effective_from from public.daily_goals where user_id = :'user_a'),
  current_date,
  'the budget is dated from today, leaving past days measured against past targets'
);


-- 3. A HAND-SET TARGET IS NEVER OVERWRITTEN ----------------------------------

update public.daily_goals
set kcal = 1800, is_custom = true
where user_id = :'user_a';

update public.profiles set activity_level = 'very_active' where id = :'user_a';

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1800,
  'changing the profile does not overwrite a target the user set by hand'
);

insert into public.weight_logs (user_id, measured_on, weight_kg)
values (:'user_a', current_date - 1, 68.6);

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1800,
  'nor does a new weigh-in'
);


-- 4. LOGGING -----------------------------------------------------------------

insert into public.food_logs (user_id, log_date, meal, food_id, serving_id, quantity)
select :'user_a', current_date, 'breakfast', f.id, s.id, 1
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'nasi-lemak-ayam';

insert into public.food_logs (user_id, log_date, meal, food_id, serving_id, quantity)
select :'user_a', current_date, 'breakfast', f.id, s.id, 2
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'teh-tarik';

-- 640 for the plate, 2 x 135 for the teh tarik.
select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  910,
  'daily_nutrition totals the day from the catalogue and the quantity'
);

-- The two-column foreign key is the only thing stopping a plate of nasi lemak
-- being measured in cups of teh tarik.
select throws_ok(
  format(
    $q$insert into public.food_logs (user_id, log_date, meal, food_id, serving_id)
       values (%L, current_date, 'lunch',
         (select id from public.foods where slug = 'nasi-lemak-ayam'),
         (select s.id from public.food_servings s
            join public.foods f on f.id = s.food_id
           where f.slug = 'teh-tarik' and s.is_default))$q$,
    :'user_a'
  ),
  '23503',
  null,
  'a portion from a different dish is rejected by the composite foreign key'
);


-- 5. STREAK ------------------------------------------------------------------

insert into public.food_logs (user_id, log_date, meal, food_id, serving_id)
select :'user_a', current_date - 1, 'dinner', f.id, s.id
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'roti-canai';

select is(
  (select current_days from public.logging_streak(:'user_a')),
  2,
  'two consecutive logged days read as a streak of two'
);


select * from finish();

rollback;
