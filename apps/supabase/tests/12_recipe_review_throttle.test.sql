-- ---------------------------------------------------------------------------
-- The hourly ceiling on the recipe publishing review.
--
-- It exists because the AI meter stopped being one. Every request to OpenRouter
-- used to be claimed against a monthly allowance, so this path was bounded
-- along with everything else; the quota counts SCANS now and the review is
-- deliberately not a scan, which left `{action: 'review'}` — a model call any
-- signed-in caller can reach with a public recipe of their own — with nothing
-- in front of it.
--
-- The assertion that matters is the last pair: a limit a second request can
-- walk through is not a limit, and the guard lives in an
-- `on conflict do update ... where`, which is the kind of SQL that looks right
-- and silently does nothing when it is wrong.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\set user_a '66666666-6666-6666-6666-666666666666'
\set user_b '77777777-7777-7777-7777-777777777777'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ra@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rb@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- -- GRANTS ------------------------------------------------------------------
-- No client write grant at all, like `scan_usage`: a client that could write
-- here could zero its own throttle.

select ok(
  has_table_privilege('authenticated', 'public.recipe_review_usage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.recipe_review_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.recipe_review_usage', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.recipe_review_usage', 'DELETE'),
  'a signed-in user may read their own review count and never write it'
);

select ok(
  not (select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'claim_recipe_review'),
  'claim_recipe_review is not executable by a signed-in user'
);

select ok(
  not (select bool_or(pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_recipe_review', 'recipe_review_hourly_limit')),
  'PUBLIC has no execute right on either of them'
);

-- -- THE CEILING -------------------------------------------------------------
-- Read from the function rather than written as 10: the number is allowed to
-- change, and a test that hard-coded it would fail on a correct change.

select is(
  (select allowed from public.claim_recipe_review(:'user_a')),
  true,
  'the first review of the hour is allowed'
);

update public.recipe_review_usage
   set reviews = public.recipe_review_hourly_limit()
 where user_id = :'user_a';

select is(
  (select allowed from public.claim_recipe_review(:'user_a')),
  false,
  'and the one past the ceiling is refused'
);

-- One account's spending is not another's. The window is shared, the row is
-- not, and a limit keyed only by the hour would refuse everybody the moment one
-- person looped.
select is(
  (select allowed from public.claim_recipe_review(:'user_b')),
  true,
  'while another account is untouched by it'
);

select * from finish();

rollback;
