-- ---------------------------------------------------------------------------
-- Images move to Cloudflare R2.
--
-- The two buckets and their eight object policies were the only part of this
-- schema `supabase db diff` could not see, which is why they were hand-written
-- and why `tests/03_storage.test.sql` existed at all. Both are gone: objects
-- live in an R2 bucket now, and the `photos` edge function is what decides
-- whether a key belongs to the caller.
--
-- The BUCKETS themselves are not dropped here, and cannot be: hosted Supabase
-- puts a `protect_delete` trigger on `storage.objects` and `storage.buckets`
-- that refuses a direct delete and points at the Storage API. Which is the
-- right shape anyway — a bucket was never schema, it only ever lived in SQL
-- because there was nowhere else to declare it. The baseline no longer creates
-- them, so a database built from these migrations has none; the two on the
-- deployed project were removed through the Storage API once.
--
-- What does NOT change is the columns. `food_logs.photo_path` and
-- `profiles.avatar_path` still hold a key and never a URL — that was the whole
-- point of storing a key, and it is why this migration touches no column
-- definition and writes no new one.
--
-- What DOES change is the shape of a key. It used to be `<user>/<file>`, with
-- the bucket picking the namespace; one bucket now holds both kinds, so the
-- kind leads: `meals/<user>/<uuid>.jpg` and `avatars/<user>/<uuid>.jpg`. Any
-- key still in the old shape names an object that no longer exists anywhere,
-- so it is cleared rather than left to render as a plate that failed to load.
-- ---------------------------------------------------------------------------

-- Keys that point into the buckets being retired. There are no users yet, so
-- in practice this clears a developer's own test plates; the alternative is a
-- diary full of tiles that spin and then break.
update public.food_logs
   set photo_path = null
 where photo_path is not null
   and photo_path not like 'meals/%';

update public.profiles
   set avatar_path = null
 where avatar_path is not null
   and avatar_path not like 'avatars/%';

-- The policies keyed on `(storage.foldername(name))[1] = auth.uid()`. Their
-- replacement is `ownsKey` in `functions/_shared/r2.ts`, and leaving these
-- behind would mean two answers to one question — one of them about a bucket
-- nothing writes to any more.
drop policy if exists "avatars: anyone may read" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: replace own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
drop policy if exists "meal photos: read own" on storage.objects;
drop policy if exists "meal photos: upload own" on storage.objects;
drop policy if exists "meal photos: replace own" on storage.objects;
drop policy if exists "meal photos: delete own" on storage.objects;
