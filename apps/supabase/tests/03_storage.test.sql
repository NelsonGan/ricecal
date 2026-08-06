-- ---------------------------------------------------------------------------
-- No buckets.
--
-- This file used to assert that two buckets existed with the right privacy,
-- size limit and mime types. Images live in Cloudflare R2 now, and what is left
-- is the inverse assertion: nothing should be putting them back.
--
-- It is worth a test rather than a comment because `supabase db diff` cannot
-- see the `storage` schema — it never could, which is why the buckets were
-- hand-written in the first place. A bucket recreated through the dashboard, or
-- a policy left behind by a half-reverted migration, would be invisible to
-- every other check in the pipeline. It would also be a second place object
-- authorization lives, which is exactly the thing this migration removed.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select is(
  (select count(*)::integer from storage.buckets where id in ('avatars', 'meal-photos')),
  0,
  'the old image buckets are gone — objects live in R2, behind the photos function'
);

-- The policies keyed on `(storage.foldername(name))[1] = auth.uid()`. Their
-- replacement is `ownsKey` in `functions/_shared/r2.ts`, and having both would
-- mean two answers to one question.
select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname like 'avatars:%' or policyname like 'meal photos:%')
  ),
  0,
  'no object policies survive for buckets that no longer exist'
);

select * from finish();

rollback;
