-- ---------------------------------------------------------------------------
-- Reviews: the window, and the arithmetic of a period that has already ended.
--
-- Nothing here is new data, so the risks are all about BOUNDARIES, and every
-- one of them is quiet:
--
--   1. A period that has not finished. The current week averages the days
--      lived so far, so a review opened on Tuesday would call it a light week
--      and be wrong by Sunday. It must not be in the list at all.
--   2. EVERY period in the window, however thin. There was a sufficiency rule
--      here and it hid weeks; what is left to prove is that nothing else does,
--      because a list quietly missing a week looks exactly like a list.
--   3. A month is not thirty days. `review_end` is the one place that knows it,
--      and February is the assertion that proves it.
--   4. Weight change measures from the reading the period OPENED at, which is
--      the last one BEFORE it. Measured from the first reading inside it, a
--      user who first stood on the scale on Wednesday loses two days of the
--      change they made.
--   5. `review_meals` groups by NAME. Grouping by `food_id` looks equivalent
--      until you remember that an estimate, an archetype and a recipe all write
--      null there, and those are exactly the meals a review is about.
--
-- Runs as `authenticated` with a forged JWT claim, which is what PostgREST does
-- on every request. As `postgres` the table owner bypasses RLS and the
-- isolation assertions below pass while proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- UPDATE, not insert: `on_auth_user_created` already made the profile and the
-- settings row inside the insert above. The timezone is pinned because every
-- window below is anchored to `local_today()`.
update public.profiles
  set timezone = 'Asia/Kuala_Lumpur'
  where id in (:'user_a', :'user_b');

-- A budget from well before anything logged, so every day in range has one.
insert into public.daily_goals (user_id, effective_from, kcal, carbs_g, protein_g, fat_g)
values
  (:'user_a', public.local_today(:'user_a') - 200, 2000, 220, 130, 66),
  (:'user_b', public.local_today(:'user_b') - 200, 2000, 220, 130, 66);

-- THE WEEK UNDER TEST: the one that ended most recently, whichever weekday it
-- happens to be today. Written as a date expression rather than a literal
-- because these tests run on a moving today, in CI and on a laptop.
--
--   last_start = the Monday of the current week, minus seven
--
-- Four days logged in it, one of them deliberately over budget, and the
-- heaviest deliberately the dish that was eaten ONCE — so an ordering by
-- repeats and an ordering by calories cannot agree.
--
-- The photograph is on the OLDER of the two nasi lemak rows on purpose: a group
-- keeps the newest picture anybody took of it, and "newest that HAS one" is a
-- different rule from "the newest one's", which is the one a plain array_agg
-- would implement.
insert into public.food_logs (
  user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
  serving_label, serving_factor, quantity, source, logged_at, photo_path
)
select
  :'user_a',
  (date_trunc('week', public.local_today(:'user_a'))::date - 7) + offset_days,
  name, kcal, carbs, protein, fat, '1 serving', 1, 1, 'search',
  ((date_trunc('week', public.local_today(:'user_a'))::date - 7) + offset_days)::timestamptz + interval '12 hours',
  photo
from (values
  (0, 'Nasi lemak',     900, 100.0, 30.0, 40.0, 'meals/a/one.jpg'),
  (1, 'nasi lemak',     900, 100.0, 30.0, 40.0, null),
  (2, 'Char kuey teow', 800,  90.0, 25.0, 35.0, null),
  -- One day over the 2,000 budget, so `days_under_goal` cannot be a count of
  -- logged days wearing a different name.
  (3, 'Bak kut teh',   2400,  80.0, 90.0, 60.0, null)
) as f(offset_days, name, kcal, carbs, protein, fat, photo);

-- A meal in the CURRENT week, which no review may include.
insert into public.food_logs (
  user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
  serving_label, serving_factor, quantity, source
)
values (:'user_a', public.local_today(:'user_a'), 'Roti canai', 300, 40, 6, 13, '1 serving', 1, 1, 'search');

-- Two weigh-ins inside the week and one the day before it. The change the
-- review reports is measured against that earlier one.
insert into public.weight_logs (user_id, measured_on, weight_kg)
values
  (:'user_a', date_trunc('week', public.local_today(:'user_a'))::date - 8, 70.0),
  (:'user_a', date_trunc('week', public.local_today(:'user_a'))::date - 6, 69.5),
  (:'user_a', date_trunc('week', public.local_today(:'user_a'))::date - 4, 69.0);

-- B's own week, so isolation has something to fail on.
insert into public.food_logs (
  user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
  serving_label, serving_factor, quantity, source
)
select
  :'user_b',
  (date_trunc('week', public.local_today(:'user_b'))::date - 7) + offset_days,
  'Mee goreng', 700, 80, 20, 26, '1 serving', 1, 1, 'search'
from generate_series(0, 6) as offset_days;


-- AS USER A ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;


-- The window ------------------------------------------------------------------

select is(
  (select count(*)::integer from public.review_periods('week')
   where starts_on >= date_trunc('week', public.local_today())::date),
  0,
  'the week still being lived is not offered as a review'
);

select is(
  (select count(*)::integer from public.review_periods('month')
   where starts_on >= date_trunc('month', public.local_today())::date),
  0,
  'and neither is the current month'
);

-- Thirteen or fourteen weeks depending on where today falls in its own week,
-- which is why this is a range rather than a number. What matters is that it is
-- about a quarter and not a year.
select ok(
  (select count(*) from public.review_periods('week')) between 13 and 14,
  'the weekly list reaches about three months back'
);

select ok(
  (select count(*) from public.review_periods('month')) between 6 and 7,
  'and the monthly list about six'
);


-- Nothing is hidden -----------------------------------------------------------
--
-- Every week in the window comes back, and all but one of them are empty. The
-- assertion is that the empty ones are PRESENT and say so, rather than being
-- dropped: a review of a week nobody logged is seven hollow marks, which is a
-- thing worth seeing.

select is(
  (select days_logged from public.review_periods('week')
   where starts_on = date_trunc('week', public.local_today())::date - 14),
  0,
  'a week with nothing logged is still offered, and says nothing was'
);

select is(
  (select count(*)::integer from public.review_periods('week') where kcal_avg is not null),
  1,
  'and only the week with food in it has an average at all'
);


-- What one period comes to ----------------------------------------------------

select is(
  (select days_logged from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  4,
  'the summary counts the days that have food in them'
);

select is(
  (select kcal_avg from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  1250::numeric,
  'and averages over those days rather than over seven'
);

select is(
  (select days_under_goal from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  3,
  'the day over budget is not counted as under it'
);

select is(
  (select heaviest_kcal from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  2400,
  'the heaviest day is the heaviest day'
);

-- 69.0 measured against the 70.0 from the day BEFORE the week, not against the
-- 69.5 that opened it.
select is(
  (select weight_change from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  -1.0::numeric,
  'weight change is measured from where the week started, not from its first weigh in'
);


-- Meals -----------------------------------------------------------------------

-- A drawing on the row that also has the photograph, which is the pairing this
-- list needs: it leads with the picture and falls back to the drawing, so
-- `review_meals` hands over both and the screen chooses. It used to join back
-- to `food_logs` for the icons, because `food_log_details` nulled them whenever
-- an entry had a photograph. The view coalesces them now and the join is gone;
-- this is the assertion that the two ways agree.
update public.food_logs
   set item_icon_set = 'dishes', item_icon_name = 'nasi-lemak'
 where user_id = :'user_a'
   and lower(item_name) = 'nasi lemak'
   and photo_path is not null;

select is(
  (select icon_name
     from public.review_meals('week', date_trunc('week', public.local_today())::date - 7, 5)
    where lower(name) = 'nasi lemak'),
  'nasi-lemak',
  'a photographed dish hands over its drawing as well as its photograph'
);

select is(
  (select count(*)::integer
     from public.review_meals('week', date_trunc('week', public.local_today())::date - 7, 5)
    where lower(name) = 'nasi lemak'),
  1,
  'two spellings of one dish are one dish'
);

-- Bak kut teh at 2,400 is the dearest of the four, and the list is ordered by
-- what one plate cost rather than by how often it was eaten — which is the
-- whole reason "most logged" became "biggest": the two nasi lemak rows would
-- have taken the top of this list with the lightest dish in the week.
select is(
  (select name from public.review_meals('week', date_trunc('week', public.local_today())::date - 7, 5)
   limit 1),
  'Bak kut teh',
  'the biggest plate is first'
);

-- The picture, which is what the biggest plates lead with. Only one of the two
-- nasi lemak rows carries one, and it is not the newer of them.
select is(
  (select photo_path
     from public.review_meals('week', date_trunc('week', public.local_today())::date - 7, 5)
    where lower(name) = 'nasi lemak'),
  'meals/a/one.jpg',
  'a dish keeps the newest photograph anybody took of it, not the newest row'
);

-- And a dish nobody photographed says so, rather than borrowing one. Null is
-- what sends the row back to its drawing.
select is(
  (select photo_path
     from public.review_meals('week', date_trunc('week', public.local_today())::date - 7, 5)
    where name = 'Bak kut teh'),
  null::text,
  'a dish with no photograph has none'
);


-- Shape -----------------------------------------------------------------------

select is(
  (select count(*)::integer from public.review_series('week', date_trunc('week', public.local_today())::date - 7)),
  7,
  'a weekly review draws one column per day'
);

select is(
  public.review_end('month', date '2026-02-01'),
  date '2026-02-28',
  'a month ends when the month ends'
);


-- AS USER B ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

-- B logged seven days in the same week. If RLS were not applying to the tables
-- underneath, this would be A's four days plus B's seven.
select is(
  (select days_logged from public.review_summary('week', date_trunc('week', public.local_today())::date - 7)),
  7,
  'one user''s review is built from their own diary and nobody else''s'
);


select * from finish();

rollback;
