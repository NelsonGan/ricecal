-- ---------------------------------------------------------------------------
-- Buckets and object policies.
--
-- These live in a hand-written migration because `supabase db diff` does not
-- see the `storage` schema — which also means the drift check does not see
-- them. Nothing else would notice a bucket that quietly became public, so this
-- file is the only guard on it.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select is(
  (select count(*)::integer from storage.buckets where id in ('avatars', 'meal-photos')),
  2,
  'both buckets exist'
);

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars are public-read, so a signed URL is not needed to render one'
);

-- The one that matters. A photo of a meal is a photo of where somebody was.
select is(
  (select public from storage.buckets where id = 'meal-photos'),
  false,
  'meal photos are private'
);

-- Both cast to bigint: `file_size_limit` is bigint and the literal is integer,
-- and pgTAP's `is()` is strictly same-type — the mismatch is a "function
-- is(bigint, integer) does not exist" error, not a failed assertion.
select is(
  (select file_size_limit from storage.buckets where id = 'meal-photos')::bigint,
  (10 * 1024 * 1024)::bigint,
  'meal photos are capped at 10 MB'
);

select ok(
  (select 'image/heic' = any (allowed_mime_types) from storage.buckets where id = 'meal-photos'),
  'HEIC is accepted, because that is what an iPhone camera produces'
);

-- Eight policies: read/insert/update/delete for each bucket.
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname like 'avatars:%' or policyname like 'meal photos:%')
  ),
  8,
  'every bucket has read, insert, update and delete policies'
);

-- RLS off on storage.objects would make all eight policies decorative.
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true,
  'row level security is on for storage.objects'
);

select * from finish();

rollback;
