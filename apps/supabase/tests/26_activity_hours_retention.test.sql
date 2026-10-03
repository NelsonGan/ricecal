begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select plan(25);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
select (now() at time zone 'UTC')::date as utc_today \gset

-- The sweep is global. Isolate its fixtures inside this rolled-back transaction.
delete from public.activity_hours;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}', '{}'),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}', '{}');

insert into public.activity_hours (user_id, log_date, hour, steps) values
  (:'user_a', :'utc_today'::date - 100, 9, 100),
  (:'user_a', :'utc_today'::date - 32, 10, 200),
  (:'user_b', :'utc_today'::date - 32, 11, 300),
  (:'user_a', :'utc_today'::date - 31, 12, 400),
  (:'user_a', :'utc_today'::date - 30, 13, 500),
  (:'user_a', :'utc_today'::date, 14, 600),
  (:'user_b', :'utc_today'::date, 15, 700);

insert into public.activity_days (user_id, log_date, provider, steps, active_kcal)
values (:'user_a', :'utc_today'::date - 32, 'apple_health', 8500, 420);
insert into public.activity_sessions
  (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal, avg_hr, max_hr, hr_zones)
values (:'user_a', 'apple_health', 'kept-workout', :'utc_today'::date - 32, 'run',
  now() - interval '32 days', now() - interval '32 days' + interval '30 minutes', 1800, 200,
  130, 170, '{"easy":100,"steady":1000,"hard":600,"peak":100}');
insert into public.weight_logs (user_id, measured_on, weight_kg)
values (:'user_a', :'utc_today'::date - 32, 68);
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
create temp table preserved as select
  (select to_jsonb(a) from public.activity_days a where user_id = :'user_a') as day,
  (select to_jsonb(a) from public.activity_sessions a where user_id = :'user_a') as workout,
  (select to_jsonb(a) from public.weight_logs a where user_id = :'user_a') as weight,
  (select to_jsonb(a) from public.activity_summary('1y') a) as summary,
  (select jsonb_agg(to_jsonb(a)) from public.activity_series('1y') a) as series,
  (select to_jsonb(a) from public.review_summary('month', date_trunc('month', :'utc_today'::date - 32)::date) a) as review;

select ok(has_function_privilege('service_role', 'public.prune_activity_hours(timestamptz,integer)', 'EXECUTE'), 'service role can prune');
select ok(not has_function_privilege('authenticated', 'public.prune_activity_hours(timestamptz,integer)', 'EXECUTE'), 'clients cannot prune');
select ok(not has_function_privilege('anon', 'public.prune_activity_hours(timestamptz,integer)', 'EXECUTE'), 'anonymous callers cannot prune');
set local role authenticated;
select throws_ok('select public.prune_activity_hours()', '42501', null, 'pruning is denied through the client API');
reset role;

set local role service_role;
select is((public.prune_activity_hours(now(), 2)->>'pruned')::integer, 2, 'one batch removes at most its limit');
select is((select count(*)::integer from public.activity_hours), 5, 'other rows survive the first batch');
select is((public.prune_activity_hours(now(), 2)->>'pruned')::integer, 1, 'the next batch finishes the backlog');
select is((public.prune_activity_hours()->>'pruned')::integer, 0, 'retrying an empty sweep is a no-op');
select is((public.prune_activity_hours()->>'remaining')::boolean, false, 'empty backlog is reported accurately');
select is((public.prune_activity_hours()->>'before')::date, :'utc_today'::date - 31, 'cutoff includes the timezone buffer');
select is((select count(*)::integer from public.activity_hours where log_date >= :'utc_today'::date - 31), 4, 'boundary day and all newer hours remain');
select is((public.prune_activity_hours(now() + interval '10 years')->>'pruned')::integer, 0, 'a future schedule cannot delete recent hours');
set local timezone = 'Pacific/Kiritimati';
select is((public.prune_activity_hours()->>'before')::date, :'utc_today'::date - 31, 'database timezone cannot shift the cutoff');
set local timezone = 'UTC';
reset role;

select is((select to_jsonb(a) from public.activity_days a where user_id = :'user_a'), (select day from preserved), 'old daily totals remain exactly unchanged');
select is((select to_jsonb(a) from public.activity_sessions a where user_id = :'user_a'), (select workout from preserved), 'workouts and heart summaries remain unchanged');
select is((select to_jsonb(a) from public.weight_logs a where user_id = :'user_a'), (select weight from preserved), 'weigh-ins remain unchanged');
select is((select to_jsonb(a) from public.activity_summary('1y') a), (select summary from preserved), 'legacy activity summary is unchanged');
select is((select jsonb_agg(to_jsonb(a)) from public.activity_series('1y') a), (select series from preserved), 'legacy chart series is unchanged');
select is((select to_jsonb(a) from public.review_summary('month', date_trunc('month', :'utc_today'::date - 32)::date) a), (select review from preserved), 'monthly review is unchanged');

-- Old binaries can still read and write their table, including a historical
-- backfill. The next sweep removes expired hours without refusing that sync.
set local role authenticated;
select lives_ok(format($q$insert into public.activity_hours (user_id, log_date, hour, steps) values (%L, %L::date - 50, 1, 123)$q$, :'user_a', :'utc_today'), 'old client writes still succeed');
select is((select count(*)::integer from public.activity_hours where log_date = :'utc_today'::date), 1, 'old client reads today through its existing RLS policy');
reset role;
set local role service_role;
select is((public.prune_activity_hours()->>'pruned')::integer, 1, 'expired rows reintroduced by an old binary are swept later');

insert into public.activity_hours (user_id, log_date, hour, steps)
select :'user_a', :'utc_today'::date - 2000 - (n / 24), n % 24, 1
from generate_series(0, 1000) n;
select is((public.prune_activity_hours(now(), 2147483647)->>'pruned')::integer, 1000, 'even an oversized requested batch is capped by the database');
select is((select count(*)::integer from public.activity_hours where log_date < :'utc_today'::date - 31), 1, 'the capped batch leaves its remainder for retry');
select is((public.prune_activity_hours(now() - interval '10 years')->>'pruned')::integer, 0, 'an old delivery cannot advance the retention cutoff');

select * from finish();
rollback;
