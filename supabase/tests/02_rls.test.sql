-- ---------------------------------------------------------------------------
-- Row level security: can one user reach another user's data.
--
-- This is the suite that matters. Everything else in this schema fails loudly
-- when it is wrong; a missing policy fails by returning MORE rows, which looks
-- exactly like the feature working.
--
-- The tests run as the `authenticated` role with a forged JWT claim, which is
-- what PostgREST does on every request. Running them as `postgres` would prove
-- nothing at all: the table owner bypasses RLS, so every query would pass.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- A logs a plate; B logs one too.
insert into public.food_logs (user_id, log_date, meal, food_id, serving_id)
select :'user_a', current_date, 'lunch', f.id, s.id
from public.foods f join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'nasi-lemak-ayam';

insert into public.food_logs (user_id, log_date, meal, food_id, serving_id)
select :'user_b', current_date, 'lunch', f.id, s.id
from public.foods f join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'roti-canai';

-- A creates a private dish.
insert into public.foods (owner_id, name, icon_name, kcal, carbs_g, protein_g, fat_g)
values (:'user_a', 'Mak''s rendang', 'rendang', 420, 12, 30, 28);

insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_a', current_date, 68.0);
insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_b', current_date, 74.0);


-- AS USER A ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.food_logs),
  1,
  'a user sees only their own food logs'
);

select is(
  (select count(*)::integer from public.weight_logs),
  1,
  'a user sees only their own weigh-ins'
);

select is(
  (select count(*)::integer from public.profiles),
  1,
  'a user sees only their own profile'
);

-- 28 catalogue rows plus the one dish this user created.
select is(
  (select count(*)::integer from public.foods),
  29,
  'a user sees the shared catalogue plus their own dishes'
);

-- The views are `security_invoker`, so the table policies filter them. A view
-- left on the default would run as its owner and leak everything.
select is(
  (select count(*)::integer from public.daily_nutrition),
  1,
  'daily_nutrition is filtered by the caller, not by its owner'
);

select is(
  (select count(*)::integer from public.food_log_details),
  1,
  'food_log_details is filtered by the caller'
);

-- Writing a row attributed to somebody else is the attack the with-check half
-- of each policy exists to stop.
select throws_ok(
  format(
    $q$insert into public.food_logs (user_id, log_date, meal, food_id, serving_id)
       select %L, current_date, 'dinner', f.id, s.id
       from public.foods f join public.food_servings s
         on s.food_id = f.id and s.is_default
       where f.slug = 'teh-tarik'$q$,
    :'user_b'
  ),
  '42501',
  null,
  'a user cannot log food against another user'
);

-- An UPDATE aimed at a row the policy hides does NOT raise: the row simply is
-- not there to match, and the statement reports zero rows affected. That is the
-- correct behaviour and the reason this is asserted on the outcome rather than
-- with throws_ok — a test expecting an exception here would fail against a
-- perfectly secure database.
update public.profiles set display_name = 'hijacked' where id = :'user_b';

select is(
  (select count(*)::integer from public.profiles where display_name = 'hijacked'),
  0,
  'an update aimed at another profile matches nothing'
);

-- Entitlements come from the RevenueCat webhook running as service_role. There
-- is no insert GRANT at all, so this is a privilege error and not merely a
-- policy miss — a forgotten policy could not turn into a free subscription.
select throws_ok(
  format($q$insert into public.subscriptions (user_id, status) values (%L, 'active')$q$, :'user_a'),
  '42501',
  null,
  'a user cannot grant themselves a subscription'
);

select throws_ok(
  $q$insert into public.achievements (key, icon_name) values ('cheated', 'star')$q$,
  '42501',
  null,
  'a user cannot invent a badge'
);

select throws_ok(
  $q$insert into public.foods (owner_id, name, icon_name, kcal) values (null, 'Fake', 'rice', 1)$q$,
  '42501',
  null,
  'a user cannot insert into the shared catalogue'
);

reset role;


-- AS USER B ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.food_logs),
  1,
  'the other user sees only their own log'
);

-- A's private dish must not appear, so B is back to the 28 shared rows.
select is(
  (select count(*)::integer from public.foods),
  28,
  'a private dish is invisible to everyone else'
);

select is(
  (select count(*)::integer from public.food_servings),
  84,
  'and so are its portions'
);

reset role;

-- 'b' rather than '': with no name from the provider, handle_new_user falls
-- back to the local part of b@example.test.
select is(
  (select display_name from public.profiles where id = :'user_b'),
  'b',
  'and the row it aimed at is genuinely unchanged'
);


select * from finish();

rollback;
