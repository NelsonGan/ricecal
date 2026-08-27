-- ---------------------------------------------------------------------------
-- Deleting an account: does the cascade run, and does it run for the role that
-- will be running it.
--
-- App Review guideline 5.1.1(v) is why the feature exists;
-- `functions/delete-account` is how it works. It deletes one row from
-- `auth.users` and lets the schema's `on delete cascade` do everything else.
--
-- THE ROLE IS THE HALF THAT IS EASY TO MISS. GoTrue performs that delete as
-- `supabase_auth_admin`, which has no privileges in `public` at all. So any
-- trigger that fires inside the cascade and touches a `public` table runs
-- without them.
--
-- `sync_daily_goals` did. It is attached to `weight_logs` for DELETE, its first
-- statement reads `public.profiles`, and it was invoker-rights: deleting an
-- account raised `permission denied for table profiles`, GoTrue answered
-- "Database error deleting user", and the feature worked for exactly those
-- accounts that had never recorded a weight. Every real account has recorded a
-- weight.
--
-- That is checked here as a PROPERTY rather than by re-enacting the delete as
-- GoTrue, because `postgres` is not a member of `supabase_auth_admin` and
-- cannot become one — and a delete run as the owner succeeds either way, which
-- proves nothing, the same way an RLS test run as the owner proves nothing. The
-- property is exact: every trigger that can fire inside the cascade must be
-- SECURITY DEFINER, and the set of tables the cascade reaches is computed
-- rather than listed.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

\set user_a '11111111-1111-1111-1111-111111111111'

insert into auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  :'user_a', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'leaving@example.test',
  '{}'::jsonb, '{"full_name": "Leaving"}'::jsonb, now(), now()
);

-- An account with something in it, so that "nothing is left" is a claim about a
-- diary rather than about an empty account. The weigh-in is the row that
-- matters: it is the one whose DELETE trigger reaches into `public`.
insert into public.food_logs
  (user_id, log_date, item_name, item_icon_set, item_icon_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values
  (:'user_a', current_date, 'Nasi lemak ayam berempah', 'dishes', 'nasi-lemak',
   640, 78, 27, 25, '1 plate', 1);

insert into public.weight_logs (user_id, measured_on, weight_kg)
values (:'user_a', current_date, 68.0);

insert into public.daily_logs (user_id, log_date, water_ml)
values (:'user_a', current_date, 500);

select isnt(
  (select count(*)::integer from public.profiles where id = :'user_a'),
  0,
  'the fixture account exists before anything is deleted'
);


-- THE TRIGGERS THE CASCADE WILL FIRE -----------------------------------------
--
-- Every table reachable from `auth.users` by a foreign key, transitively, and
-- then every DELETE trigger on one of them. The answer names the offenders
-- rather than counting them, so a failure says which function to fix.

select is(
  (
    with recursive cascaded(sch, tab) as (
      select 'auth'::name, 'users'::name
      union
      select n.nspname, c.relname
        from pg_constraint k
        join pg_class c on c.oid = k.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_class rc on rc.oid = k.confrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
        join cascaded parent on parent.tab = rc.relname and parent.sch = rn.nspname
       where k.contype = 'f'
    )
    select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join cascaded on cascaded.sch = n.nspname and cascaded.tab = c.relname
     -- Bit 3 of `tgtype` is DELETE. `tgisinternal` excludes the referential
     -- integrity triggers Postgres makes for the foreign keys themselves.
     where not t.tgisinternal
       and (t.tgtype::integer & 8) <> 0
       and not p.prosecdef
  ),
  '',
  'every trigger the account cascade can fire is SECURITY DEFINER'
);


-- WHAT IS LEFT ---------------------------------------------------------------
--
-- Every table in `public` that names an account directly, found through its
-- foreign key rather than written down. A list here is a list somebody has to
-- remember to extend, and the thing it would fail to notice — a new table added
-- without `on delete cascade` — is one user's diary left behind in production.
--
-- A temporary function rather than the query twice, and it takes the account as
-- an ARGUMENT because psql does not interpolate a `\set` variable inside a
-- dollar-quoted body. It goes with the rollback.

create function pg_temp.rows_naming(p_user uuid)
returns table (relation text, rows integer)
language plpgsql
as $$
declare
  target record;
  found integer;
begin
  for target in
    select c.relname as tab, a.attname as col
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class rc on rc.oid = k.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
      -- `conkey[1]` is the referencing column. Every one of these keys is a
      -- single column; a composite one would need more than this test does.
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and rn.nspname = 'auth'
       and rc.relname = 'users'
       and n.nspname = 'public'
  loop
    execute format('select count(*) from public.%I where %I = $1', target.tab, target.col)
      into found
      using p_user;
    if found > 0 then
      relation := target.tab;
      rows := found;
      return next;
    end if;
  end loop;
end $$;

select isnt(
  (select count(*)::integer from pg_temp.rows_naming(:'user_a')),
  0,
  'the fixture really is spread across several tables before the delete'
);

delete from auth.users where id = :'user_a';

-- Names what survived rather than counting it, so a failure says which table
-- forgot its cascade.
select is(
  (
    select coalesce(string_agg(relation, ', ' order by relation), '')
    from pg_temp.rows_naming(:'user_a')
  ),
  '',
  'nothing keyed on the account survives it'
);


select * from finish();

rollback;
