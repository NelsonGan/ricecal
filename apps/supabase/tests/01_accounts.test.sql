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

select plan(18);

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
    -- The whole of the calorie plan, with the weigh-in below: ten kilos to lose.
    -- There is no goal enum to agree or disagree with it.
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

-- Mifflin-St Jeor: 10(68) + 6.25(163) - 5(28) - 161 = 1397.75 BMR,
-- x 1.375 (light) = 1921.9 maintenance.
--
-- The cut comes off as a share of maintenance rather than as the flat 400 this
-- expected until `evidence_based_targets` rewrote the function: 0.5 kg/week over
-- 7700 kcal/kg asks for 550, a fifth of maintenance allows 384.4, and the
-- smaller one wins. 1921.9 - 384.4 = 1537.5, to the nearest ten = 1540. The
-- 1200 floor for a woman is nowhere near it.
select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1540,
  'the weigh-in completes the inputs and the budget is computed'
);

-- Protein from body weight rather than from a share of energy: 68 x 1.6 = 108.8,
-- which is under the 35%-of-energy ceiling (134.75) that only binds on a small
-- budget. Fat is a quarter of energy, 1540 x 0.25 / 9 = 42.8. Carbohydrate is
-- whatever those two leave — (1540 - 436 - 387) / 4 = 179.25 — which is what
-- makes the three add back up to the budget instead of to a fixed ratio.
select is(
  (select array[carbs_g, protein_g, fat_g] from public.daily_goals where user_id = :'user_a'),
  array[179, 109, 43],
  'protein comes from body weight and carbohydrate takes the remainder'
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


-- 3b. THE TARGET WEIGHT IS THE PLAN ------------------------------------------
--
-- `target_weight_kg` used to be a number the app stored and the budget ignored,
-- so a lose/maintain/gain enum decided everything: someone 10 kg out and someone
-- 200 g out were handed the same deficit, and it carried on after they arrived.
-- The gap between the two weights is the whole plan now, and the column is on
-- the recompute trigger's list — which is the half that is easy to leave behind,
-- because without it the target is only ever read when something ELSE about the
-- profile changes.
--
-- Back under the formula's control, and back to the body section 2 described, so
-- every figure below is comparable with the 1540 asserted there. The profile
-- write is second because it is what fires the recompute.
update public.daily_goals set is_custom = false where user_id = :'user_a';
update public.profiles set activity_level = 'light' where id = :'user_a';

-- Half a kilo under the current 68.0, which is inside the deadband: body weight
-- swings that far on water inside a day, so this reads as arrived. Maintenance
-- is 1921.9 and nothing comes off it.
update public.profiles set target_weight_kg = 67.8 where id = :'user_a';

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1920,
  'a target already reached stops the cut, and moving the target recomputes at all'
);

-- One kilo to go. The taper closes what is left over four weeks rather than at
-- the nominal 0.5 kg/week: 0.25 kg/week is 275 kcal, under the 384.4 the
-- maintenance cap would have allowed, so 1921.9 - 275 = 1646.9 -> 1650.
update public.profiles set target_weight_kg = 67.0 where id = :'user_a';

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1650,
  'the last kilo is not chased at the full pace'
);

-- A target ABOVE the current weight is a gain, with no enum left to contradict
-- it. Seven kilos is well past the taper, so it is the full 0.25 kg/week: 275
-- kcal, under the 288.3 that 15% of maintenance allows. 1921.9 + 275 = 2196.9.
update public.profiles set target_weight_kg = 75.0 where id = :'user_a';

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  2200,
  'a target above the current weight is a surplus, read off the sign of the gap'
);

-- Every account created before the target was collected has a null here, and a
-- plan cannot be read off a number nobody gave. Maintenance, and no deficit
-- invented on their behalf.
update public.profiles set target_weight_kg = null where id = :'user_a';

select is(
  (select kcal from public.daily_goals where user_id = :'user_a'),
  1920,
  'no target stated is maintenance rather than a guessed direction'
);


-- 4. LOGGING -----------------------------------------------------------------

-- The dishes to log against. These used to come from a seed migration, which
-- `simplify_scope` deleted along with user-created foods -- nothing populates
-- `foods` any more except the catalogue import, and a test may not depend on
-- whether someone has run that. Fixtures are local to this transaction and roll
-- back with it, the same way 00_catalogue and 02_rls already do theirs.
-- `icon_set` alongside `icon_name`: the pair is optional but indivisible, and the
-- set no longer defaults to `dishes` to supply the missing half.
insert into public.foods (slug, name, icon_set, icon_name, place, kcal, carbs_g, protein_g, fat_g)
values
  ('fixture-nasi-lemak-ayam', 'Nasi lemak ayam', 'dishes', 'nasi-lemak', 'mamak',    640, 78, 27, 25),
  ('fixture-teh-tarik',       'Teh tarik',       'dishes', 'teh-tarik',  'kopitiam', 135, 21,  3,  4),
  ('fixture-roti-canai',      'Roti canai',      'dishes', 'roti-canai', 'mamak',    301, 39,  6, 13);

insert into public.food_servings (food_id, slug, label, factor, is_default)
select f.id, 'plate', '1 plate', 1, true
from public.foods f
where f.slug in ('fixture-nasi-lemak-ayam', 'fixture-teh-tarik', 'fixture-roti-canai');

insert into public.food_logs (user_id, log_date, food_id, serving_id, quantity)
select :'user_a', current_date, f.id, s.id, 1
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'fixture-nasi-lemak-ayam';

insert into public.food_logs (user_id, log_date, food_id, serving_id, quantity)
select :'user_a', current_date, f.id, s.id, 2
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'fixture-teh-tarik';

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
    $q$insert into public.food_logs (user_id, log_date, food_id, serving_id)
       values (%L, current_date,
         (select id from public.foods where slug = 'fixture-nasi-lemak-ayam'),
         (select s.id from public.food_servings s
            join public.foods f on f.id = s.food_id
           where f.slug = 'fixture-teh-tarik' and s.is_default))$q$,
    :'user_a'
  ),
  '23503',
  null,
  'a portion from a different dish is rejected by the composite foreign key'
);


-- 5. STREAK ------------------------------------------------------------------

insert into public.food_logs (user_id, log_date, food_id, serving_id)
select :'user_a', current_date - 1, f.id, s.id
from public.foods f
join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'fixture-roti-canai';

select is(
  (select current_days from public.logging_streak(:'user_a')),
  2,
  'two consecutive logged days read as a streak of two'
);


select * from finish();

rollback;
