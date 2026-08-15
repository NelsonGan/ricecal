-- ---------------------------------------------------------------------------
-- The hourly ceiling on barcode lookups: who can move it, and whether it stops.
--
-- The barcode function spends no AI budget, so `claim_ai_inference` never sees
-- it and this is the only thing standing between a signed-in caller and an
-- unbounded loop of live Open Food Facts fetches. It is the AI meter's shape,
-- and so are its risks: the ceiling guard lives in an `on conflict do update
-- ... where`, which looks right and silently does nothing when it is wrong, so
-- the limit is driven to its edge and pushed one past it.
--
-- Runs as `authenticated` with a forged JWT claim wherever the question is about
-- what a user can reach, exactly as PostgREST does. Run as `postgres` the table
-- owner bypasses RLS and every one of those would pass while proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- -- GRANTS --------------------------------------------------------------------
-- The client may read its own counter and may never move it, exactly as with
-- `ai_usage`: a client that could write here could zero its own throttle.

select ok(
  has_table_privilege('authenticated', 'public.barcode_scan_usage', 'SELECT'),
  'a signed-in user may read their own scan counter'
);

select ok(
  not has_table_privilege('authenticated', 'public.barcode_scan_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.barcode_scan_usage', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.barcode_scan_usage', 'DELETE'),
  'and may never write it: no insert, update or delete grant at all'
);

select ok(
  not (select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'claim_barcode_scan'),
  'claim_barcode_scan is not executable by a signed-in user'
);

select ok(
  (select pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_barcode_scan'),
  'but the edge function, as service_role, can'
);

-- `db diff` does not report grant deltas, so this is the only thing that
-- notices a revoke that never reached a migration.
select ok(
  not (select bool_or(pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_barcode_scan', 'barcode_hourly_limit')),
  'PUBLIC has no execute right on either throttle function'
);

-- -- ISOLATION ------------------------------------------------------------------

select claim_barcode_scan(:'user_a');

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.barcode_scan_usage),
  0,
  'one user cannot see another user''s scan counter'
);

reset role;
select set_config('request.jwt.claims', null, true);

-- -- THE CEILING -----------------------------------------------------------------
-- `barcode_hourly_limit()` rather than a literal, so a change to the number does
-- not fail a test that is otherwise correct.

update public.barcode_scan_usage
   set scans = public.barcode_hourly_limit() - 1
 where user_id = :'user_a'
   and window_start = date_trunc('hour', (now() at time zone 'utc')) at time zone 'utc';

select is(
  (select allowed from public.claim_barcode_scan(:'user_a')),
  true,
  'the scan that lands exactly on the limit is allowed'
);

select is(
  (select allowed from public.claim_barcode_scan(:'user_a')),
  false,
  'and the one after it is refused'
);

select * from finish();

rollback;
