-- ---------------------------------------------------------------------------
-- Reporting a recipe and blocking its cook.
--
-- App Review guideline 1.2 asks a community shelf for a way to report content
-- and a way to block a person. Both of them are RLS, not application code — see
-- the header of `schemas/24_moderation.sql` — so this suite runs as the
-- `authenticated` role with a forged claim, exactly as `02_rls.test.sql` does
-- and for the same reason: run as the owner, every one of these queries returns
-- the rows it is supposed to hide and every assertion passes.
--
-- The last two are the ones with teeth. A restrictive policy that was written
-- permissive would WIDEN what is visible rather than narrow it, and nothing
-- about that fails loudly: the shelf simply goes on showing a recipe somebody
-- asked never to see again.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

\set reader '11111111-1111-1111-1111-111111111111'
\set cook   '22222222-2222-2222-2222-222222222222'
\set other  '33333333-3333-3333-3333-333333333333'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'reader', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'cook',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cook@example.test',   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'other',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test',  '{}'::jsonb, '{}'::jsonb, now(), now());

-- Two public, approved recipes by the same cook, and one by somebody else, so
-- that "blocking hides all of theirs" is distinguishable from "blocking hides
-- everything".
insert into public.recipes (id, owner_id, name, servings, is_public, review_status)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'cook',  'Sambal telur',  4, true, 'approved'),
  ('aaaaaaaa-0000-4000-8000-000000000002', :'cook',  'Ayam masak merah', 4, true, 'approved'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'other', 'Kari kepala ikan', 6, true, 'approved');

-- One from the RiceCal kitchen. It has no owner, which is what "official"
-- means, and it must survive everything below.
insert into public.recipes (id, owner_id, name, servings, is_public, review_status)
values ('aaaaaaaa-0000-4000-8000-000000000004', null, 'Nasi lemak', 2, true, 'approved');


-- AS THE READER --------------------------------------------------------------

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'reader'), true);
set local role authenticated;

select is(
  (select count(*)::integer from public.recipes),
  4,
  'the shelf starts with three cooks and the kitchen on it'
);

-- Reporting -------------------------------------------------------------------

insert into public.recipe_reports (recipe_id, reporter_id, reason)
values ('aaaaaaaa-0000-4000-8000-000000000001', :'reader', 'inappropriate');

select is(
  (select count(*)::integer from public.recipes where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0,
  'a reported recipe is gone for the person who reported it'
);

-- One report is not a verdict. The recipe is still on everybody else's shelf
-- until `report_threshold` is reached, which is what stops a single account
-- removing anybody's cooking by tapping a button.
select is(
  (select is_public from public.recipes r where r.id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  null,
  'and the reporter cannot even read its row to see whether it is still public'
);

-- Blocking --------------------------------------------------------------------

insert into public.blocked_authors (user_id, author_id) values (:'reader', :'cook');

select is(
  (select count(*)::integer from public.recipes where owner_id = :'cook'),
  0,
  'blocking a cook hides everything of theirs, not only what was reported'
);

select is(
  (select count(*)::integer from public.recipes where owner_id = :'other'),
  1,
  'and hides nobody else'
);

select is(
  (select count(*)::integer from public.recipes where owner_id is null),
  1,
  'the kitchen is not a person and survives a block'
);

reset role;


-- THE THRESHOLD ---------------------------------------------------------------
-- Two more people report the same recipe, making three, which takes it off the
-- shelf for everybody. The trigger is SECURITY DEFINER because `is_public` is
-- in nobody's client grant, so this is also the assertion that it really can
-- write it.
--
-- The second one is the control: two reports on the other recipe would have
-- been two people agreeing, and it stays up. Without it this pair of
-- assertions would pass against a trigger that fired on the first report.

insert into public.recipe_reports (recipe_id, reporter_id, reason)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'cook',  'spam'),
  ('aaaaaaaa-0000-4000-8000-000000000001', :'other', 'spam'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'reader', 'spam'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'cook',   'spam');

select is(
  (select is_public from public.recipes where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  false,
  'three separate reports take a recipe off the shelf for everyone'
);

select is(
  (select is_public from public.recipes where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  true,
  'two do not, so one account cannot remove anybody it likes'
);


select * from finish();

rollback;
