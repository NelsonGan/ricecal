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

select plan(24);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- Two entries to hide from each other. These used to be foreign keys into two
-- fixture `foods` rows; the catalogue is in Cloudflare D1 now, so an entry
-- states its own numbers. See the header of `schemas/30_food_logs.sql`.

insert into public.food_logs
  (user_id, log_date, item_name, item_icon_set, item_icon_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values
  (:'user_a', current_date, 'Nasi lemak ayam berempah', 'dishes', 'nasi-lemak',
   640, 78, 27, 25, '1 plate', 1),
  (:'user_b', current_date, 'Roti canai', 'dishes', 'roti-canai',
   301, 39, 6, 13, '1 plate', 1);

insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_a', current_date, 68.0);
insert into public.weight_logs (user_id, measured_on, weight_kg) values (:'user_b', current_date, 74.0);

-- The sixty tier-5 archetypes, captured as the owner and before any role
-- switch. The assertion below is "a user sees all of them", not "a user sees
-- sixty": the seed is the thing that decides how many there are, and a
-- hard-coded count fails on the next added archetype while saying nothing
-- about RLS.
select count(*)::integer as archetype_count from public.archetypes \gset


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

-- The archetypes are shared and undivided: there are no per-user rows for a
-- policy to hide, so this is simply everything in the table. It is the last
-- shared reference table left in this database — the catalogue itself is in
-- Cloudflare D1, reached through the `catalogue` edge function, and no RLS
-- policy here has anything to say about it.
select is(
  (select count(*)::integer from public.archetypes),
  :archetype_count,
  'a user sees the whole archetype list'
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
    $q$insert into public.food_logs
         (user_id, log_date, item_name, base_kcal, base_carbs_g, base_protein_g,
          base_fat_g, serving_label, serving_factor)
       values (%L, current_date, 'Roti canai', 301, 39, 6, 13, '1 plate', 1)$q$,
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

-- The archetypes are read-only to clients for the same reason and by the same
-- mechanism: no insert GRANT at all, so this is a privilege error rather than a
-- policy miss. A user who could write one could change what every failed scan
-- in the app falls back to.
select throws_ok(
  $q$insert into public.archetypes (slug, name, kcal, carbs_g, protein_g, fat_g)
     values ('fake', 'Fake', 1, 0, 0, 0)$q$,
  '42501',
  null,
  'a user cannot insert an archetype'
);

select throws_ok(
  $q$update public.archetypes set kcal = 1$q$,
  '42501',
  null,
  'nor rewrite the figure an existing one carries'
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

-- Both users see the same archetypes. There is nothing user-scoped in them,
-- which is the point: one set of rows, one policy, no divergence to test for.
select is(
  (select count(*)::integer from public.archetypes),
  :archetype_count,
  'the other user sees the same archetypes'
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
-- (no grant on the table) was stopping anyone.
--
-- Asserted here because it is invisible: the app works either way, and the
-- functions do not fail until someone widens a table grant somewhere else.

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('seed_archetype_foods', 'set_ingredient_quantity',
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

-- And for `day_plates`, which is the same read one shape wider: the biggest
-- plate of each day, for the month grid. Same risk in the same direction — the
-- revoke has to hold and the grant has to survive, or the calendar draws a month
-- of empty cells for everybody.
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'day_plates'
     and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'day_plates is not executable by PUBLIC'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'day_plates'
     and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  1,
  'but a signed-in user can read their own month'
);

-- It is SECURITY INVOKER, which is what makes the `p_user_id` argument safe to
-- have a default on: passing somebody else's uuid reaches their rows only if RLS
-- lets it, and RLS does not. Declared rather than assumed, because a later edit
-- adding `security definer` to speed something up would turn this function into
-- a way to read any diary in the database.
select is(
  (select p.prosecdef
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'day_plates'),
  false,
  'day_plates runs as the caller, so RLS still decides whose diary it reads'
);

-- The retention sweep's own trigger, which is the most dangerous function in
-- this schema by some distance. It is `security definer`, it reads the shared
-- secret out of the vault, and what it POSTs to deletes photographs across
-- every account — so a client that could execute it could spend the whole
-- backlog at will, and one that could read `retention_runs` could read the
-- responses those calls came back with.
--
-- Postgres grants EXECUTE to PUBLIC on a new function and `anon` inherits it,
-- so the revoke in `35_retention.sql` is the only thing standing here. Asserted
-- because nothing else would notice: the app never calls this, so the grant
-- being wrong has no symptom at all until somebody goes looking.
select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('sweep_meal_photos', 'expired_meal_photos', 'clear_meal_photos')
     and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'the retention functions are not executable by PUBLIC'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('sweep_meal_photos', 'expired_meal_photos', 'clear_meal_photos')
     and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'nor by a signed-in user, who has no business sweeping anybody'
);

-- RLS on with no policies is how this table is closed, exactly as
-- `food_scan_items` is: `service_role` bypasses it and everyone else reads
-- nothing, so a grant added by mistake still exposes no rows.
select is(
  (select relrowsecurity
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'retention_runs'),
  true,
  'retention_runs has row level security enabled'
);

select * from finish();

rollback;
