-- ---------------------------------------------------------------------------
-- Water, now that it is a volume rather than a count of taps.
--
-- The one assertion that matters is that `add_water` ADDS. Glasses were set —
-- the client knew the number it wanted and wrote it whole — and millilitres
-- cannot be, because a quick-add row is a thing people drum on: two overlapping
-- taps that each read the day and write their own answer lose one of the two
-- amounts, silently, and the user sees a number that is simply short. So the
-- read and the write are one statement, and this drives them.
--
-- The clamps are the other half. A negative amount is how the client takes back
-- what it just added, and it has to floor at zero rather than raise, because a
-- user pressing undo has already made their only mistake.
--
-- Runs as `authenticated` with a forged JWT claim, exactly as PostgREST does.
-- Run as `postgres` the table owner bypasses RLS and every assertion about
-- whose day is being written would pass while proving nothing.
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
-- `db diff` does not report grant deltas, so a revoke that never reached a
-- migration is invisible everywhere except here.

select ok(
  (select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'add_water'),
  'a signed-in user may add water'
);

select ok(
  not (select pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'add_water'),
  'PUBLIC has no execute right on it'
);


-- AS USER A ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  public.add_water(250, current_date),
  250,
  'the first drink of the day creates the row'
);

-- The whole reason this is a function. Three separate calls with no read
-- between them, which is what three quick taps are.
select public.add_water(500, current_date);
select public.add_water(500, current_date);

select is(
  public.add_water(250, current_date),
  1500,
  'and every one after it adds to what is there'
);

select is(
  (select water_ml from public.daily_logs
    where user_id = :'user_a' and log_date = current_date),
  1500,
  'the row agrees with what the function returned'
);

select is(
  public.add_water(-500, current_date),
  1000,
  'a negative amount takes water back'
);

select is(
  public.add_water(-99999, current_date),
  0,
  'and undoing more than was ever there floors at zero rather than raising'
);

select is(
  public.add_water(999999, current_date),
  20000,
  'a fat-fingered custom amount is capped, not refused'
);

-- Days are separate rows, and yesterday is reachable: Today shows whichever day
-- the strip has selected, so water is written against that date and not against
-- `now()`.
select is(
  public.add_water(400, current_date - 1),
  400,
  'a past day keeps its own total'
);

select is(
  (select count(*)::integer from public.daily_logs),
  2,
  'one row per day, and nothing of anybody else''s'
);


-- AS USER B ------------------------------------------------------------------
-- The function is `security invoker`, so the policies on `daily_logs` are what
-- decide whose day is written. B drinking on the same date must not touch A's.

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is(
  public.add_water(750, current_date),
  750,
  'another user on the same day starts from nothing, not from A''s total'
);

select * from finish();
rollback;
