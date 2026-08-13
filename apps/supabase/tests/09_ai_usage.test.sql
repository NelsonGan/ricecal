-- ---------------------------------------------------------------------------
-- The monthly ceiling on model requests: who can read it, who can move it, and
-- whether it actually stops at the limit.
--
-- The interesting assertion here is the LAST one. A hard limit that a second
-- request can walk through is not a hard limit, and the guard that prevents it
-- lives in an `on conflict do update ... where`, which is the kind of SQL that
-- looks right and silently does nothing when it is wrong. So the limit is
-- driven right up to its edge and pushed one past it.
--
-- Runs as `authenticated` with a forged JWT claim wherever the question is
-- about what a user can reach, exactly as PostgREST does. Run as `postgres`
-- the table owner bypasses RLS and every one of those would pass while
-- proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- -- GRANTS ------------------------------------------------------------------
-- The client may read its own meter and may never move it. Written as grants
-- rather than as policies so that a forgotten policy cannot quietly become a
-- way to zero your own usage.

select ok(
  has_table_privilege('authenticated', 'public.ai_usage', 'SELECT'),
  'a signed-in user may read their own usage'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ai_usage', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ai_usage', 'DELETE'),
  'and may never write it: no insert, update or delete grant at all'
);

-- The claim function is the only writer, and it is the server's alone. A
-- client that could call it could spend somebody else''s allowance, or refuse
-- to spend its own.
select ok(
  not (select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'claim_ai_inference'),
  'claim_ai_inference is not executable by a signed-in user'
);

select ok(
  (select pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_ai_inference'),
  'but the edge functions, as service_role, can'
);

-- PUBLIC keeps no execute right on any of the three. `db diff` does not report
-- grant deltas, so this is the only thing that notices a `revoke` that never
-- reached a migration — see the note in CLAUDE.md.
select ok(
  not (select bool_or(pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_ai_inference', 'ai_usage_this_month', 'ai_monthly_limit')),
  'PUBLIC has no execute right on any of the usage functions'
);

-- -- COUNTING ----------------------------------------------------------------

select is(
  (select allowed from public.claim_ai_inference(:'user_a')),
  true,
  'the first request of the month is allowed'
);

select is(
  (select used from public.claim_ai_inference(:'user_a')),
  2,
  'and the meter counts up from there'
);

-- -- ISOLATION ---------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.ai_usage),
  0,
  'one user cannot see another user''s meter'
);

select is(
  (select used from public.ai_usage_this_month()),
  0,
  'and reads zero for themselves rather than no row at all'
);

reset role;
select set_config('request.jwt.claims', null, true);

-- -- THE CEILING -------------------------------------------------------------
-- Straight to the edge. `ai_monthly_limit()` rather than a literal 3000: the
-- number is allowed to change, and a test that hard-codes it would start
-- failing on a change that is entirely correct.

update public.ai_usage
   set inferences = public.ai_monthly_limit() - 1
 where user_id = :'user_a'
   and period_start = date_trunc('month', (now() at time zone 'utc'))::date;

select is(
  (select allowed from public.claim_ai_inference(:'user_a')),
  true,
  'the request that lands exactly on the limit is allowed'
);

select is(
  (select allowed from public.claim_ai_inference(:'user_a')),
  false,
  'and the one after it is refused'
);

select * from finish();

rollback;
