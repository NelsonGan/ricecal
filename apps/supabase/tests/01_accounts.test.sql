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

select plan(20);

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

-- A TIMEZONE THIS DATABASE CAN USE, whatever the client sends.
--
-- `authenticated` has a table-wide update grant on `profiles`, and `local_today`
-- does `now() at time zone <that text>` — which RAISES for anything that is not
-- an IANA name. Half the server reads that function, and the daily scan quota
-- reads it inside a claim whose failure is deliberately read as "allow
-- uncounted": one junk write would buy an account unlimited scans for ever.
-- So a value that is not a real zone is ignored rather than stored, and the row
-- keeps the one it had.
update public.profiles set timezone = 'not/a-zone' where id = :'user_a';

select is(
  (select timezone from public.profiles where id = :'user_a'),
  'UTC',
  'a timezone that is not a real zone is ignored, and the old one stands'
);

-- The point of the whole exercise: the function that half the server depends on
-- still answers rather than raising.
select lives_ok(
  $$select public.local_today('11111111-1111-1111-1111-111111111111')$$,
  'so local_today still answers for that account'
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

-- The entries to total. These used to be foreign keys into three fixture
-- `foods` rows, and the catalogue is in Cloudflare D1 now — so an entry states
-- its own numbers and a fixture is just an insert. See the header of
-- `schemas/30_food_logs.sql`.

insert into public.food_logs
  (user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, quantity)
values
  (:'user_a', current_date, 'Nasi lemak ayam', 640, 78, 27, 25, '1 plate', 1, 1),
  (:'user_a', current_date, 'Teh tarik',       135, 21,  3,  4, '1 glass', 1, 2);

-- 640 for the plate, 2 x 135 for the teh tarik.
select is(
  (select kcal from public.daily_nutrition where user_id = :'user_a' and log_date = current_date),
  910,
  'daily_nutrition totals the day from the entry and the quantity'
);

-- The portion is part of the entry, so it scales the entry's own figures. This
-- replaces a test of the composite foreign key that guaranteed a serving
-- belonged to its food — the thing it protected against, a plate of nasi lemak
-- measured in cups of teh tarik, is now unspellable rather than rejected.
insert into public.food_logs
  (user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, quantity)
-- Thirty days back, so it lands outside both the day total above and the two
-- consecutive days the streak test below counts.
values (:'user_a', current_date - 30, 'Nasi lemak ayam', 640, 78, 27, 25, 'Half', 0.5, 1);

select is(
  (select kcal from public.food_log_details
    where user_id = :'user_a' and log_date = current_date - 30),
  320,
  'the portion factor scales the entry''s own base figures'
);


-- 5. STREAK ------------------------------------------------------------------

insert into public.food_logs
  (user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
values (:'user_a', current_date - 1, 'Roti canai', 301, 39, 6, 13, '1 piece', 1);

select is(
  (select current_days from public.logging_streak(:'user_a')),
  2,
  'two consecutive logged days read as a streak of two'
);


select * from finish();

rollback;
