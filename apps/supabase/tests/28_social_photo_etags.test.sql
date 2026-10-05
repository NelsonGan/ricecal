begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set writer 'a8800000-0000-4000-8000-000000000001'
\set reader 'a8800000-0000-4000-8000-000000000002'
\set fresh  'a8810000-0000-4000-8000-000000000001'
\set settled 'a8810000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@photo-etags.example.test', '{}', '{}'
from unnest(array[:'writer'::uuid, :'reader'::uuid]) id;
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, photo_path)
values
  (:'fresh', :'writer', 'Rice bowl', 280, 45, 8, 6, '1 bowl', 1, 'meals/' || :'writer' || '/fresh.jpg'),
  (:'settled', :'writer', 'Noodles', 400, 60, 12, 10, '1 bowl', 1, 'meals/' || :'writer' || '/settled.jpg');

select set_config('request.jwt.claims', json_build_object('sub', :'writer', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_social_post(:'fresh', 'Lunch', 'public') as fresh_post \gset
select public.create_social_post(:'settled', 'Dinner', 'public') as settled_post \gset
select throws_ok(
  format($$select public.record_social_photo_etags('{"meals/%s/fresh.jpg": "\"abc\""}')$$, :'writer'),
  '42501', null, 'a signed-in account cannot record an ETag');
reset role;

-- The settled post was published long enough ago that its upload URL lapsed.
update public.social_posts set created_at = now() - interval '11 minutes' where id = :'settled_post';

select is(
  public.record_social_photo_etags(jsonb_build_object(
    'meals/' || :'writer' || '/fresh.jpg', '"fresh-tag"',
    'meals/' || :'writer' || '/settled.jpg', '"settled-tag"')),
  1, 'only a photo past its upload window is recorded');
select is((select photo_etag from public.social_posts where id = :'fresh_post'), null,
  'a photo whose upload URL may still be live keeps reading its tag from R2');
select is((select photo_etag from public.social_posts where id = :'settled_post'), '"settled-tag"',
  'a settled photo keeps the tag the signer read');

select is(
  public.record_social_photo_etags(jsonb_build_object('meals/' || :'writer' || '/settled.jpg', '"other"')),
  0, 'a recorded tag is never overwritten');
select is((select photo_etag from public.social_posts where id = :'settled_post'), '"settled-tag"',
  'the first recorded tag stands');

update public.social_posts set photo_etag = null where id = :'settled_post';
select is(
  public.record_social_photo_etags(jsonb_build_object('meals/' || :'writer' || '/settled.jpg', 'W/"weak"')),
  0, 'a tag that is not a strong ETag is ignored');
select throws_ok($$select public.record_social_photo_etags('[]')$$, '22023', null,
  'anything but an object of tags is refused');

select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
update public.social_posts set photo_etag = '"settled-tag"' where id = :'settled_post';
set local role authenticated;
select is((select photo_etag from public.social_photo_claims(array['meals/' || :'writer' || '/settled.jpg'])),
  '"settled-tag"', 'a reader''s claim carries the recorded tag');
reset role;

select * from finish();
rollback;
