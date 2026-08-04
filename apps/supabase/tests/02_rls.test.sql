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

select plan(19);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- Two catalogue dishes to log against. Nothing seeds `foods` any more, so the
-- fixture is local to this transaction and rolls back with it.
-- `icon_set` alongside `icon_name`: the pair is optional but indivisible, and the
-- set no longer defaults to `dishes` to supply the missing half.
insert into public.foods (slug, name, icon_set, icon_name, kcal, carbs_g, protein_g, fat_g)
values
  ('fixture-nasi-lemak', 'Nasi lemak ayam berempah', 'dishes', 'nasi-lemak', 640, 78, 27, 25),
  ('fixture-roti-canai', 'Roti canai',               'dishes', 'roti-canai', 301, 39,  6, 13);

insert into public.food_servings (food_id, slug, label, factor, is_default)
select f.id, 'plate', '1 plate', 1, true
from public.foods f
where f.slug in ('fixture-nasi-lemak', 'fixture-roti-canai');

-- A logs a plate; B logs one too.
insert into public.food_logs (user_id, log_date, food_id, serving_id)
select :'user_a', current_date, f.id, s.id
from public.foods f join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'fixture-nasi-lemak';

insert into public.food_logs (user_id, log_date, food_id, serving_id)
select :'user_b', current_date, f.id, s.id
from public.foods f join public.food_servings s on s.food_id = f.id and s.is_default
where f.slug = 'fixture-roti-canai';

insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_a', current_date, 68.0);
insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_b', current_date, 74.0);

-- How big the catalogue actually is, captured here as the owner and before any
-- role switch. The assertions below are "a user sees all of it", not "a user
-- sees two rows": on a database where the catalogue import has been run there
-- are ~457,000, and a hard-coded 2 fails while saying nothing about RLS.
select count(*)::integer as catalogue_size from public.foods \gset
select count(*)::integer as serving_count from public.food_servings \gset


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

-- The catalogue is shared and undivided: there are no per-user rows left for a
-- policy to hide, so this is simply everything in the table.
select is(
  (select count(*)::integer from public.foods),
  :catalogue_size,
  'a user sees the whole shared catalogue'
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
    $q$insert into public.food_logs (user_id, log_date, food_id, serving_id)
       select %L, current_date, f.id, s.id
       from public.foods f join public.food_servings s
         on s.food_id = f.id and s.is_default
       where f.slug = 'fixture-roti-canai'$q$,
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

-- The catalogue is read-only to clients for the same reason and by the same
-- mechanism: no insert GRANT at all, so this is a privilege error rather than a
-- policy miss. Users do not create dishes, and a policy added later by mistake
-- could not make them able to.
select throws_ok(
  $q$insert into public.foods (slug, name, kcal) values ('fake', 'Fake', 1)$q$,
  '42501',
  null,
  'a user cannot insert into the catalogue'
);

select throws_ok(
  $q$insert into public.food_servings (food_id, slug, label, factor)
     select f.id, 'huge', 'Enormous', 9 from public.foods f limit 1$q$,
  '42501',
  null,
  'nor invent a portion for a dish in it'
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

-- Both users see the same catalogue. There is nothing user-scoped left in it,
-- which is the point: one set of rows, one policy, no divergence to test for.
select is(
  (select count(*)::integer from public.foods),
  :catalogue_size,
  'the other user sees the same catalogue'
);

select is(
  (select count(*)::integer from public.food_servings),
  :serving_count,
  'and the same portions'
);

reset role;

-- 'b' rather than '': with no name from the provider, handle_new_user falls
-- back to the local part of b@example.test.
select is(
  (select display_name from public.profiles where id = :'user_b'),
  'b',
  'and the row it aimed at is genuinely unchanged'
);


-- Functions the client may not call at all ------------------------------------
--
-- Postgres grants EXECUTE to PUBLIC on a newly created function, and `anon`
-- inherits from PUBLIC. Every schema file that declares one of these revokes
-- that, and for a while none of those revokes reached a migration — so the
-- database allowed what the source said it forbade, and only a second lock
-- (no grant on `foods`) was stopping anyone.
--
-- Asserted here because it is invisible: the app works either way, and the
-- functions do not fail until someone widens a table grant somewhere else.

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('upsert_estimate_food', 'estimate_food_backlog',
                       'seed_archetype_foods', 'set_ingredient_quantity',
                       'remove_ingredient')
     and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'the scan write functions are not executable by PUBLIC'
);

-- And the two the client legitimately calls still are. Revoking is only right
-- if the ingredient steppers keep working.
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('set_ingredient_quantity', 'remove_ingredient')
     and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  2,
  'but a signed-in user can still edit the parts of their own plate'
);

-- The same pair for `day_marks`, which is new and reads one week of a diary.
-- It is a read, so the risk is the other way round from the writes above: the
-- revoke has to hold AND the grant has to survive, or the week strip on Today
-- draws no dots at all for everybody.
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'day_marks'
     and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'day_marks is not executable by PUBLIC'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'day_marks'
     and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  1,
  'but a signed-in user can read their own week'
);


select * from finish();

rollback;
