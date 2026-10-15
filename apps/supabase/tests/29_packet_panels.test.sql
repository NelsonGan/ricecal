-- ---------------------------------------------------------------------------
-- A photographed panel waiting for its packet's name.
--
-- `packet_panels` holds figures that end up in the shared catalogue, and the
-- only thing that may put them there is `scan-meal`, as service_role. So the
-- client must not reach it in either direction: reading it would show what the
-- server kept, and writing it would let a user choose the figures strangers get
-- served for a barcode. The rest is that the row goes with its entry, and that
-- the checks hold the line the edge function already drew.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\set user_a '11111111-1111-1111-1111-111111111111'
\set entry  'e0000000-0000-4000-8000-000000000029'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- A packet logged off its nutrition panel, under the name the scan gave it.
insert into public.food_logs
  (id, user_id, log_date, quantity, source, scan_id, display_label,
   item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor)
values
  (:'entry', :'user_a', current_date, 1, 'camera',
   'e0000000-0000-4000-8000-000000000030', 'Packaged food',
   'Packaged food', 242, 35.6, 13.6, 10.4, '1 serving', 1);

insert into public.packet_panels (food_log_id, barcode, kcal, carbs_g, protein_g, fat_g, serving_g)
values (:'entry', '09557753125180', 242, 35.6, 13.6, 10.4, 112);

-- -- THE CLIENT CANNOT REACH IT ------------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.packet_panels', 'SELECT')
  and not has_table_privilege('authenticated', 'public.packet_panels', 'INSERT')
  and not has_table_privilege('authenticated', 'public.packet_panels', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.packet_panels', 'DELETE'),
  'a signed-in user has no grant on packet_panels at all'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$ select count(*) from public.packet_panels $$,
  '42501',
  null,
  'not even the owner of the entry can read the figures kept for it'
);

select throws_ok(
  format(
    $$ insert into public.packet_panels (food_log_id, barcode, kcal, carbs_g, protein_g, fat_g)
       values (%L, '09556001315694', 100, 10, 10, 2) $$,
    :'entry'),
  '42501',
  null,
  'and nobody can choose the figures by writing a row'
);

reset role;
select set_config('request.jwt.claims', null, true);

-- -- THE CHECKS ------------------------------------------------------------------
-- The same lines `productFromLabel` draws, so a row that slipped past it still
-- cannot be stored.

select throws_ok(
  format(
    $$ update public.packet_panels set barcode = '9557753125180' where food_log_id = %L $$,
    :'entry'),
  '23514',
  null,
  'a barcode is stored as GTIN-14 or not at all'
);

select throws_ok(
  format($$ update public.packet_panels set kcal = 0 where food_log_id = %L $$, :'entry'),
  '23514',
  null,
  'a panel that priced a serving at nothing is refused'
);

select throws_ok(
  format($$ update public.packet_panels set fat_g = -1 where food_log_id = %L $$, :'entry'),
  '23514',
  null,
  'and so is a negative macro'
);

-- -- IT GOES WITH ITS ENTRY ------------------------------------------------------

select is(
  (select count(*)::integer from public.packet_panels where food_log_id = :'entry'),
  1,
  'the panel waits against the entry'
);

delete from public.food_logs where id = :'entry';

select is(
  (select count(*)::integer from public.packet_panels where food_log_id = :'entry'),
  0,
  'and deleting the entry takes the panel with it'
);

select * from finish();

rollback;
